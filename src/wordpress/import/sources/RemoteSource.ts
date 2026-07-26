import { note } from "@clack/prompts";
import { RemoteHost } from "../../../remote/RemoteHost.ts";
import { resolveRemoteProfile } from "../../../remote/resolveProfile.ts";
import { writeLink } from "../../../profiles/ProjectLink.ts";
import { resolveProfileSelection, profileSummary } from "../../../profiles/ProfileSelection.ts";
import { loadConfig } from "../../../config/ConfigLoader.ts";
import { validateProfileConfig } from "../../../config/schema.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../../../system/safety.ts";
import { runCommand } from "../../../system/commandRunner.ts";
import { askRequiredText } from "../../../ui/prompts.ts";
import { MissingOptionError } from "../../../core/errors.ts";
import type { ImportSource, ImportSourceContext, ImportOptions } from "../ImportSource.ts";
import type { Profile } from "../../../core/model/Profile.ts";
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
 * The shared `ImportSource` implementation for `--source profile` and
 * `--source ssh` — the only difference between those two is *how*
 * `ctx.profile` gets resolved in `resolveOptions` (a saved/portable profile
 * vs. one synthesized from one-off `--ssh-*` flags), not how it's used once
 * resolved. Reuses RemoteHost directly — the same collaborator PullService
 * uses — so a remote import and a later `acli pull` share one code path.
 *
 * `remoteHostFactory` is injectable (defaulting to the real constructor)
 * purely for tests — the same seam PullService already uses.
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

    /**
     * Resolves ctx.profile: a named/portable saved profile (interactively
     * picked, or offered to create on the spot, via the same
     * ProfileSelection `acli create`/`acli link` use), or — for `--source
     * ssh` — one synthesized in memory from the one-off `--ssh-*` flags,
     * with no temp file on disk either way.
     */
    async resolveOptions(options: ImportOptions, ctx, { nonInteractive }) {
      const c = ctx as ProfileImportContext;
      const rawProfile = id === "ssh"
        ? await synthesizeSshProfile(options, nonInteractive)
        : await selectSavedProfile(options, c, nonInteractive);
      const profile = resolveRemoteProfile(rawProfile, { projectName: c.projectName });
      c.profile = profile;
      // A staging URL is an extra search-replace source, not a requirement:
      // the migration reads the real siteurl back out of the imported
      // database. Falling back to the profile's own declared URL matters
      // for content still referencing an older/alternate hostname that the
      // imported siteurl no longer matches.
      c.stagingUrl = c.stagingUrl || profile.urls?.staging || undefined;
    },

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

async function selectSavedProfile(options: ImportOptions, ctx: ProfileImportContext, nonInteractive: boolean): Promise<Profile> {
  const { config } = await loadConfig({ configPath: options.config });
  const selection = await resolveProfileSelection({ config, options, attachedProfileName: undefined, required: true, nonInteractive });
  if (!nonInteractive) note(profileSummary(selection.profile!, ctx.environment), `Selected profile: ${selection.profileName}`);
  return selection.profile!;
}

async function synthesizeSshProfile(options: ImportOptions, nonInteractive: boolean): Promise<Profile> {
  const sshHost = options.sshHost || (nonInteractive ? undefined : await askRequiredText("Remote SSH host:"));
  const sshUser = options.sshUser || (nonInteractive ? undefined : await askRequiredText("Remote SSH username:"));
  const remotePath = options.remotePath || (nonInteractive ? undefined : await askRequiredText("Remote WordPress root path:"));
  if (!sshHost || !sshUser || !remotePath) {
    throw new MissingOptionError(["--ssh-host <host>", "--ssh-user <user>", "--remote-path <path>"]);
  }
  const profile: Profile = {
    type: "wordpress",
    ssh: {
      host: sshHost,
      username: sshUser,
      port: options.sshPort ? Number(options.sshPort) : 22,
      identityFile: options.sshKey || "",
      hostKeyPolicy: "accept-new",
    },
    remote: { projectRoot: remotePath, wordpressRoot: "." },
    files: { transport: "rsync" },
    database: { driver: (options.dbDriver as Profile["database"]["driver"]) || "wp-cli" },
    ...(options.remoteUrl ? { urls: { staging: options.remoteUrl } } : {}),
  };
  validateProfileConfig(profile, "--source ssh profile");
  return profile;
}
