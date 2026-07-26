import { RemoteHost } from "../../../remote/RemoteHost.ts";
import { writeLink } from "../../../profiles/ProjectLink.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../../../system/safety.ts";
import { runCommand } from "../../../system/commandRunner.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import type { RemoteFacts } from "../../../core/model/RemoteFacts.ts";
import type { ResolvedProfile } from "../../../core/model/Profile.ts";

export interface ProfileImportContext extends ImportSourceContext {
  profile: ResolvedProfile;
  projectName: string;
  environment?: string;
  skipFiles?: boolean;
  skipGitInit?: boolean;
  presetName?: string;
}

type RemoteHostFactory = (profile: ResolvedProfile) => RemoteHost;

/**
 * The shared `ImportSource` implementation for `--source profile` and
 * `--source ssh` — the only difference between those two is *how*
 * `ctx.profile` gets resolved before the workflow starts (a saved/portable
 * profile vs. one synthesized from one-off `--ssh-*` flags; see
 * src/commands/import.ts), not how it's used once resolved. Reuses
 * RemoteHost directly (the same collaborator ExistingWPStrategy's
 * scaffold() and PullService both use), so remote-import behavior stays
 * identical to the profile-based `create --existing` path this replaces.
 *
 * `remoteHostFactory` is injectable (defaulting to the real
 * constructor) purely for tests — mirrors the same seam
 * ExistingWPStrategy/PullService already use.
 */
export function createProfileImportSource(
  id: string,
  label: string,
  remoteHostFactory: RemoteHostFactory = (profile) => new RemoteHost(profile),
): ImportSource {
  const remote = (ctx: ImportSourceContext) => remoteHostFactory((ctx as ProfileImportContext).profile);

  return {
    id,
    label,

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
      c.skipGitInit = true;
      await runCommand("git", ["init"], { cwd: targetDir });
      await runCommand("git", ["remote", "add", "origin", found.url], { cwd: targetDir });
    },

    buildPlan(ctx) {
      const c = ctx as ProfileImportContext;
      const service = remote(ctx);
      return {
        preset: c.presetName || null,
        profile: c.profile.profileName || null,
        project: c.projectName,
        localEnvironment: c.environment,
        remoteHost: c.profile.ssh.host,
        remoteWordPressRoot: c.profile.remote.wordpressRoot,
        databaseDriver: c.skipDatabase ? "skipped" : c.profile.database.driver,
        fileTransfer: c.skipFiles ? "skipped" : c.profile.files?.transport || "rsync",
        gitLink: !c.skipGitLink && c.profile.git?.enabled !== false,
        requiredTools: service.requiredTools({ environment: c.environment, skipFiles: c.skipFiles }),
      };
    },
  };
}
