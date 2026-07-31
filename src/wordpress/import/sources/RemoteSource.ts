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
  stagingUrl?: string;
}

type RemoteHostFactory = (profile: ResolvedProfile) => RemoteHost;

/**
 * The saved-profile import source. Reuses RemoteHost directly — the same
 * collaborator PullService uses — so an initial import and a later
 * `acli pull` share one code path.
 *
 * `remoteHostFactory` is injectable (defaulting to the real constructor)
 * purely for tests — the same seam PullService already uses.
 */
export function createProfileImportSource(
  remoteHostFactory: RemoteHostFactory = (profile) => new RemoteHost(profile),
): ImportSource {
  const remote = (ctx: ImportSourceContext) => remoteHostFactory((ctx as ProfileImportContext).profile);

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
