import path from "node:path";
import fs from "fs-extra";
import { runCommand } from "../system/commandRunner.ts";
import { toolExists } from "../system/toolCheck.ts";
import { buildSshArgs, scpConnectionArgs, shellQuote, sshTransport } from "./sshArgs.ts";
import { databaseCommand } from "./databaseCommand.ts";
import { renderTemplate } from "./resolveProfile.ts";
import type { ResolvedProfile } from "../core/model/Profile.ts";
import type { RemoteFacts } from "../core/model/RemoteFacts.ts";
import type { Spinner } from "../environments/EnvironmentService.ts";

type Runner = typeof runCommand;

/**
 * Every operation A-CLI performs against a remote WordPress host over SSH:
 * capability preflight, file sync (rsync/scp), database export, and
 * git-origin discovery. Construct it with an *already resolved* profile —
 * see `resolveRemoteProfile`, which is not idempotent.
 */
export class RemoteHost {
  profile: ResolvedProfile;
  run: Runner;

  constructor(profile: ResolvedProfile, runner: Runner = runCommand) { this.profile = profile; this.run = runner; }

  requiredTools(ctx: { environment?: string; skipFiles?: boolean }): string[] {
    const tools = ["ssh", ctx.environment === "lando" ? "lando" : "docker"];
    if (!ctx.skipFiles) tools.push(this.profile.files?.transport === "sftp" ? "scp" : "rsync");
    return [...new Set(tools)];
  }

  async preflight(ctx: { environment?: string; skipFiles?: boolean }): Promise<void> {
    const missing = this.requiredTools(ctx).filter((tool) => !toolExists(tool));
    if (missing.length) throw new Error(`Missing required tools: ${missing.join(", ")}. Run acli doctor with the same preset/profile.`);
    await this.run("ssh", buildSshArgs(this.profile.ssh, `test -d ${shellQuote(this.profile.remote.wordpressRoot)}`));
  }

  async syncFiles(targetDir: string, spinner: Spinner | null, { directories: namesOverride }: { directories?: string[] } = {}): Promise<void> {
    const config = this.profile.files || {};
    // Profiles are normalized (see normalizeProfile) before reaching
    // RemoteHost, so `targets` is always present here — legacy
    // `directories`/`excludes`-shaped profiles were already converted.
    const targets = config.targets || {};
    const names = namesOverride || Object.keys(targets);
    for (const name of names) {
      const target = targets[name];
      if (!target) throw new Error(`Unknown file sync target: ${name}`);
      const relativePath = target.path;
      const destination = path.join(targetDir, ...relativePath.split("/"));
      await fs.ensureDir(destination);
      spinner?.message(`Syncing ${relativePath}...`);
      const remoteSource = path.posix.join(this.profile.remote.wordpressRoot, relativePath);
      if ((config.transport || "rsync") === "sftp") {
        await this.run("scp", [...scpConnectionArgs(this.profile.ssh), "-r", `${this.profile.ssh.username}@${this.profile.ssh.host}:${remoteSource}/.`, destination]);
      } else {
        const args = ["-az"];
        for (const item of target.excludes || []) args.push("--exclude", item);
        for (const item of target.includes || []) args.push("--include", item);
        args.push("-e", sshTransport(this.profile.ssh), `${this.profile.ssh.username}@${this.profile.ssh.host}:${remoteSource}/`, `${destination}/`);
        await this.run("rsync", args);
      }
    }
  }

  async exportDatabase(targetDir: string, spinner: Spinner | null): Promise<void> {
    spinner?.message(`Exporting database with ${this.profile.database.driver} driver...`);
    const { command, stdin } = databaseCommand(this.profile);
    const dump = await this.run("ssh", buildSshArgs(this.profile.ssh, command), { encoding: null, ...(stdin !== undefined ? { stdin } : {}) });
    if (!dump || dump.length < 100) throw new Error(`Remote database dump is empty or invalid (${dump?.length || 0} bytes).`);
    // A full database dump — likely including real user password hashes —
    // should not be left world/group-readable at the default umask.
    await fs.writeFile(path.join(targetDir, "staging.sql"), dump, { mode: 0o600 });
  }

  /**
   * Fetches authoritative table prefix / site URL directly from the remote
   * WordPress install via wp-cli, instead of guessing them from the dump.
   * Only the wp-cli database driver guarantees `wp` is available remotely;
   * other drivers get nulls here and fall back to dump-based detection.
   */
  async getRemoteFacts(): Promise<RemoteFacts> {
    // An explicit database.tablePrefix override always wins and skips the
    // remote fetch for it entirely — it's available regardless of driver,
    // not just wp-cli.
    const explicitPrefix = this.profile.database?.tablePrefix || null;
    if (this.profile.database?.driver !== "wp-cli") return { tablePrefix: explicitPrefix, siteUrl: null };
    const root = shellQuote(this.profile.remote.wordpressRoot);
    const fetch = (command: string) => this.run("ssh", buildSshArgs(this.profile.ssh, `cd ${root} && ${command}`)).then((value) => (value as string)?.trim() || null).catch(() => null);
    const [fetchedPrefix, siteUrl] = await Promise.all([
      explicitPrefix ? Promise.resolve(null) : fetch("wp config get table_prefix --quiet"),
      fetch("wp option get siteurl --quiet"),
    ]);
    return { tablePrefix: explicitPrefix || fetchedPrefix, siteUrl };
  }

  async discoverGit(): Promise<{ directory: string; url: string } | null> {
    if (this.profile.git?.enabled === false) return null;
    const paths = this.profile.git?.discoveryPaths || [".", "wp-content/themes/{projectName}"];
    if (this.profile.git?.includeProjectRoot) {
      try {
        const url = await this.run("ssh", buildSshArgs(this.profile.ssh, `git -C ${shellQuote(this.profile.remote.projectRoot)} config --get remote.origin.url`)) as string;
        if (url) return { directory: ".", url: url.trim() };
      } catch { /* Continue with WordPress-relative discovery paths. */ }
    }
    for (const candidate of paths) {
      const directory = path.posix.join(this.profile.remote.wordpressRoot, renderTemplate(candidate, { projectName: this.profile.projectName }));
      try {
        const url = await this.run("ssh", buildSshArgs(this.profile.ssh, `git -C ${shellQuote(directory)} config --get remote.origin.url`)) as string;
        if (url) return { directory: candidate, url: url.trim() };
      } catch { /* Try the next allow-listed discovery path. */ }
    }
    return null;
  }
}
