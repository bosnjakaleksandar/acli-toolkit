import { createRemoteBackend, providerFor, type RemoteBackendFactory } from "../../../providers/registry.ts";
import { writeLink } from "../../../profiles/ProjectLink.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../../../system/safety.ts";
import { applyGitSshHostAlias, linkGitRemote } from "../../../system/git.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import type { RemoteFacts } from "../../../core/model/RemoteFacts.ts";
import type { CoolifySelection, ResolvedProfile } from "../../../core/model/Profile.ts";
import { CliError } from "../../../core/errors.ts";

export interface ProfileImportContext extends ImportSourceContext {
  profile: ResolvedProfile;
  projectName: string;
  environment?: string;
  skipFiles?: boolean;
  skipGitInit?: boolean;
  nonInteractive?: boolean;
  /** The project's name on the server, when it differs from projectName. */
  remoteProject?: string;
  /** Server prompt answers given during this run, remembered in the project link. */
  selections?: CoolifySelection;
  stagingUrl?: string;
  gitStatus?: string;
}

type GitLinker = typeof linkGitRemote;

/**
 * The saved-profile import source. Reuses the profile provider's
 * RemoteBackend (see src/providers/registry.ts) — the same
 * collaborator PullService uses — so an initial import and a later
 * `acli pull` share one code path.
 *
 * `remoteHostFactory` is injectable (defaulting to the real constructor)
 * purely for tests — the same seam PullService already uses.
 */
export function createProfileImportSource(
  remoteHostFactory: RemoteBackendFactory = createRemoteBackend,
  gitLinker: GitLinker = linkGitRemote,
): ImportSource {
  const remote = (ctx: ImportSourceContext) => {
    const c = ctx as ProfileImportContext;
    return remoteHostFactory(c.profile, {
      interactive: !c.nonInteractive,
      onSelection: (key, value) => { c.selections = { ...c.selections, [key]: value }; },
    });
  };

  return {
    label: "Staging profile",

    async preflight(ctx) {
      const c = ctx as ProfileImportContext;
      await remote(ctx).preflight({ environment: c.environment, skipFiles: c.skipFiles });
    },

    async fetchFiles(ctx, spinner) {
      const c = ctx as ProfileImportContext;
      if (c.skipFiles) return;
      await remote(ctx).syncFiles(ctx.targetDir, (spinner ?? null) as any);
    },

    async fetchDatabase(ctx, spinner) {
      await remote(ctx).exportDatabase(ctx.targetDir, (spinner ?? null) as any);
      // exportDatabase throws on failure, so reaching here means staging.sql
      // was written — the workflow itself derives hasDump from that file, not
      // from this return value (see ImportWorkflow.ts's hasDump()).
      return { hasDump: true };
    },

    async getRemoteFacts(ctx): Promise<RemoteFacts> {
      return remote(ctx).getRemoteFacts();
    },

    async linkProfile(targetDir, ctx) {
      const c = ctx as ProfileImportContext;
      await writeLink(targetDir, {
        name: c.projectName,
        type: "wordpress",
        environment: c.environment!,
        profile: c.profile.profileName,
        ...(c.remoteProject && c.remoteProject !== c.projectName ? { remoteProject: c.remoteProject } : {}),
        ...(c.selections && Object.keys(c.selections).length ? { selections: c.selections } : {}),
        linkedAt: new Date().toISOString(),
      });
      return c.profile.profileName ?? null;
    },

    async linkGit(targetDir, ctx, spinner) {
      const c = ctx as ProfileImportContext;
      const found = await remote(ctx).discoverGit();
      if (!found) return;
      // found.url is the remote server's own `git config --get
      // remote.origin.url` output — untrusted server-controlled data. Skip
      // linking rather than write something unsafe into the new project's
      // git config or hand it to `git remote add` as a positional argument.
      if (!isSafeGitUrl(found.url)) {
        (spinner as any)?.message?.(`Skipping Git link: remote origin URL looked unsafe (${redactUrlCredentials(found.url)}).`);
        return;
      }
      const localRemoteUrl = applyGitSshHostAlias(found.url, c.profile.git?.sshHostAlias);
      let result;
      try {
        result = await gitLinker(targetDir, localRemoteUrl, undefined, { previousRemoteUrl: found.url, ...(found.branch ? { branch: found.branch } : {}) });
      } catch (error: any) {
        const details = `${error?.stderr || ""}\n${error?.message || ""}`;
        if (/Permission denied \(publickey\)|Could not read from remote repository/i.test(details)) {
          const profileName = c.profile.profileName || "<profile>";
          const configuredAlias = c.profile.git?.sshHostAlias;
          throw new CliError("Git SSH authentication failed while fetching the discovered origin.", {
            code: "GIT_AUTH_FAILED",
            hint: configuredAlias
              ? `Verify the SSH alias with \`ssh -T git@${configuredAlias}\`, then resume with \`acli import --resume --name ${c.projectName}\`.`
              : `If ~/.ssh/config uses a Git account alias, run \`acli profile git-alias ${profileName} <alias> --scope user\`, then \`acli import --resume --name ${c.projectName}\`.`,
          });
        }
        throw error;
      }
      c.gitStatus = result.summary;
      return result;
    },

    buildPlan(ctx) {
      const c = ctx as ProfileImportContext;
      const service = remote(ctx);
      return {
        profile: c.profile.profileName || null,
        project: c.projectName,
        localEnvironment: c.environment,
        remoteHost: c.profile.ssh.host,
        provider: c.profile.provider,
        ...providerFor(c.profile).plan(c.profile, { skipFiles: c.skipFiles, skipDatabase: Boolean(c.skipDatabase) }),
        gitLink: !c.skipGitInit && !c.skipGitLink && c.profile.git?.enabled !== false,
        // Shown because it decides which URLs get search-replaced: the
        // imported site's own siteurl always is, and this is the extra
        // source folded in alongside it (from --remote-url, or the
        // profile's own urls.staging).
        stagingUrl: c.stagingUrl ?? c.profile.urls?.staging ?? null,
        requiredTools: service.requiredTools({ environment: c.environment, skipFiles: c.skipFiles }),
      };
    },
  };
}

export const ProfileImportSource = createProfileImportSource();
