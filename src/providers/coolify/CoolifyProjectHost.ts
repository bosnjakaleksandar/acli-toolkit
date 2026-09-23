import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import fs from "fs-extra";
import { runCommand } from "../../system/commandRunner.ts";
import { assertToolsAvailable } from "../../system/toolCheck.ts";
import { CliError } from "../../core/errors.ts";
import { buildSshArgs, scpConnectionArgs, shellQuote } from "../sshArgs.ts";
import type { ResolvedProfile } from "../../core/model/Profile.ts";
import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { RemoteBackend, RemoteGitOrigin, SyncFilesOptions } from "../contract.ts";

type Runner = typeof runCommand;

/** wp-content directories the server's `project wp-export` can export one at a time. */
export const COOLIFY_FILE_TARGETS = ["uploads", "plugins", "languages", "themes"];

// The only `project` subcommands A-CLI ever sends. Everything else the
// server offers (wp-import, db-import, db-backup, branch, deploy, shell,
// logs, admin commands) changes remote state or needs a terminal; the shared
// command runner rejects those too, as a second layer.
const READ_ONLY_SUBCOMMANDS = new Set(["list", "info", "status", "db-export", "wp-export"]);

// Where the server writes exports (root-owned, mode 711 directories; the
// file itself is owned by the requesting user, mode 600). Anything else
// printed as an export path is refused rather than handed to scp.
const EXPORT_PATH = /^\/var\/backups\/project-(?:databases|wordpress)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(?:sql\.gz|tar\.gz)$/;

/** Normalizes a server project name the way local project names are written: "Acme Client Site" -> "acme-client-site". */
export function projectSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type SelectionKey = "wordpressContainer" | "database" | "databaseName";

// Headers of the server script's numbered "which one?" menus, and which
// profile field answers each.
const SELECTION_MENUS: { header: RegExp; key: SelectionKey; what: string }[] = [
  { header: /^WordPress containers for project: /, key: "wordpressContainer", what: "WordPress containers" },
  { header: /^Databases for project: /, key: "database", what: "database containers" },
  { header: /^Available databases:$/, key: "databaseName", what: "databases" },
];

export interface SelectionMenu {
  key: SelectionKey;
  what: string;
  /** Each option's menu label plus, for containers, the container name printed under it. */
  options: { number: number; names: string[] }[];
}

/**
 * Parses the last numbered selection menu in the server's output (a re-run
 * that already answered earlier menus prints those again before the new
 * one). Returns null when the output ends without a recognized menu.
 */
export function parseSelectionMenu(output: string): SelectionMenu | null {
  const lines = output.split(/\r?\n/);
  let start = -1;
  let menu: (typeof SELECTION_MENUS)[number] | undefined;
  lines.forEach((line, index) => {
    const found = SELECTION_MENUS.find((candidate) => candidate.header.test(line.trim()));
    if (found) { start = index; menu = found; }
  });
  if (!menu) return null;
  const options: SelectionMenu["options"] = [];
  for (const line of lines.slice(start + 1)) {
    const option = line.match(/^\s*(\d+)\)\s+(.+?)(?:\s+\[[a-z]+\])?\s*$/);
    if (option) options.push({ number: Number(option[1]), names: [option[2]!.trim()] });
    else if (options.length && /^\s{3,}\S+\s*$/.test(line)) options.at(-1)!.names.push(line.trim());
  }
  return options.length ? { key: menu.key, what: menu.what, options } : null;
}

/** Asks the user to pick a menu entry; resolves to the chosen option's number. */
export type MenuChooser = (menu: SelectionMenu, context: { project: string }) => Promise<number>;

interface ProjectStatus {
  status?: string;
  git_repository?: string;
  git_branch?: string;
}

/**
 * Parses the absolute export path the server's `project db-export` /
 * `project wp-export` prints on the line after "Export created:". Returns
 * null when the server reports the component does not exist.
 */
export function parseExportPath(output: string): string | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const marker = lines.findIndex((line) => /^(?:Export|Bundle) created:$/.test(line));
  if (marker === -1) {
    if (lines.includes("Nothing to export.")) return null;
    throw new Error(`The remote project CLI did not report an export path:\n${output.trim()}`);
  }
  const exportPath = lines[marker + 1] ?? "";
  if (!EXPORT_PATH.test(exportPath) || exportPath.split("/").includes("..")) {
    throw new Error(`Refusing unexpected export path from the remote project CLI: ${JSON.stringify(exportPath)}.`);
  }
  return exportPath;
}

/**
 * The Coolify staging server's `project` CLI as a pull-only RemoteBackend.
 * Developers have no direct access to WordPress files or the database there:
 * the server exports them into its backup directory, A-CLI downloads the
 * export with scp and unpacks it locally. Only the read-only subcommands in
 * READ_ONLY_SUBCOMMANDS are ever sent, always without a TTY and with stdin
 * closed, so a server-side prompt fails fast instead of waiting for input.
 */
export class CoolifyProjectHost implements RemoteBackend {
  profile: ResolvedProfile;
  run: Runner;
  /** Interactive fallback for a menu the profile has no answer for; absent in non-interactive runs. */
  chooseOption: MenuChooser | null;
  /** Told about each interactive answer, so it can be remembered in the project link. */
  onSelection: ((key: SelectionKey, value: string) => void) | null;
  private serverProject: Promise<string> | null = null;
  // Entries picked interactively during this run, by menu, so a menu that
  // repeats (e.g. the WordPress container for every component) asks once.
  private chosen: Partial<Record<SelectionKey, string>> = {};

  constructor(profile: ResolvedProfile, runner: Runner = runCommand, { chooseOption = null, onSelection = null }: { chooseOption?: MenuChooser | null; onSelection?: ((key: SelectionKey, value: string) => void) | null } = {}) {
    if (profile.provider !== "coolify-cli" || !profile.coolify) throw new Error("CoolifyProjectHost requires a coolify-cli profile.");
    this.profile = profile;
    this.run = runner;
    this.chooseOption = chooseOption;
    this.onSelection = onSelection;
  }

  /**
   * The project name exactly as the server's `project list` prints it.
   * Local project names are lowercase slugs ("acme-client-site") while server
   * names keep their case and spaces ("Blog", "Acme Client
   * Site"), so an exact match wins and otherwise a unique slug match is used.
   */
  project(): Promise<string> {
    this.serverProject ??= this.lookupProject().catch((error) => { this.serverProject = null; throw error; });
    return this.serverProject;
  }

  /** Projects assigned to this SSH user, as `project list` prints them. */
  async listProjects(): Promise<string[]> {
    return (await this.projectCommand("list")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  private async lookupProject(): Promise<string> {
    const wanted = this.profile.coolify!.project;
    const projects = await this.listProjects();
    if (projects.includes(wanted)) return wanted;
    const matches = projects.filter((name) => projectSlug(name) === projectSlug(wanted));
    if (matches.length === 1) return matches[0]!;
    throw new CliError(matches.length ? `Project "${wanted}" matches several server projects: ${matches.join(", ")}.` : `Project "${wanted}" is not assigned to ${this.profile.ssh.username} on ${this.profile.ssh.host}.`, {
      code: "COOLIFY_PROJECT_NOT_FOUND",
      hint: projects.length ? `Projects available to you: ${projects.join(", ")}. Pass the exact one, e.g. \`acli import "${projects[0]}"\`.` : "Ask the server administrator to grant you access to the project.",
    });
  }

  requiredTools(ctx: { environment?: string; skipFiles?: boolean }): string[] {
    const tools = ["ssh", ctx.environment === "lando" ? "lando" : "docker", "scp"];
    if (!ctx.skipFiles) tools.push("tar");
    return tools;
  }

  async preflight(ctx: { environment?: string; skipFiles?: boolean }): Promise<void> {
    assertToolsAvailable(this.requiredTools(ctx));
    const project = await this.project();
    const { status } = await this.status();
    if (!status?.startsWith("running")) {
      throw new CliError(`Project "${project}" is not running on the server (status: ${status || "unknown"}).`, {
        code: "COOLIFY_PROJECT_NOT_RUNNING",
        hint: "Exports need the running WordPress and database containers. Check the project in Coolify, then retry.",
      });
    }
  }

  fileTargets(): string[] {
    return [...COOLIFY_FILE_TARGETS];
  }

  async syncFiles(targetDir: string, spinner: Spinner | null, { directories }: SyncFilesOptions = {}): Promise<void> {
    const names = directories || COOLIFY_FILE_TARGETS;
    for (const name of names) if (!COOLIFY_FILE_TARGETS.includes(name)) throw new Error(`Unknown file sync target: ${name}`);
    const project = await this.project();
    const workDir = await this.workDir(targetDir);
    const wpContent = path.join(targetDir, "wp-content");
    await fs.ensureDir(wpContent);
    for (const name of names) {
      spinner?.message(`Exporting ${name} on the server...`);
      const remotePath = parseExportPath(await this.projectCommand("wp-export", [project, name], spinner));
      if (!remotePath) {
        spinner?.message(`Skipping ${name}: not present on the server.`);
        continue;
      }
      spinner?.message(`Downloading ${name}...`);
      const archive = await this.download(remotePath, workDir);
      try {
        await this.assertSafeArchive(archive, (entry) => entry === name || entry.startsWith(`${name}/`));
        spinner?.message(`Unpacking ${name}...`);
        await this.run("tar", ["-xzf", archive, "-C", wpContent]);
      } finally {
        await fs.remove(archive).catch(() => {});
      }
    }
  }

  async exportDatabase(targetDir: string, spinner: Spinner | null): Promise<void> {
    spinner?.message("Exporting database on the server...");
    const remotePath = parseExportPath(await this.projectCommand("db-export", [await this.project(), "sql.gz"], spinner));
    if (!remotePath) throw new Error("The remote project CLI did not create a database export.");
    const workDir = await this.workDir(targetDir);
    spinner?.message("Downloading database export...");
    const archive = await this.download(remotePath, workDir);
    const dumpPath = path.join(targetDir, "staging.sql");
    try {
      await pipeline(createReadStream(archive), createGunzip(), createWriteStream(dumpPath, { mode: 0o600 }));
      const size = (await fs.stat(dumpPath).catch(() => null))?.size || 0;
      if (size < 100) throw new Error(`Remote database dump is empty or invalid (${size} bytes).`);
      await fs.chmod(dumpPath, 0o600);
    } catch (error) {
      await fs.remove(dumpPath).catch(() => {});
      throw error;
    } finally {
      await fs.remove(archive).catch(() => {});
    }
  }

  /** `wp` is not reachable through the project CLI, so the prefix comes from the profile or the dump itself. */
  async getRemoteFacts(): Promise<RemoteFacts> {
    return { tablePrefix: this.profile.database?.tablePrefix || null, siteUrl: null };
  }

  /** Uses the repository and branch Coolify deploys from, as reported by `project status`. */
  async discoverGit(): Promise<RemoteGitOrigin | null> {
    if (this.profile.git?.enabled === false) return null;
    const { git_repository: repository, git_branch: branch } = await this.status();
    if (!repository) return null;
    const url = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
      ? `git@${this.profile.coolify!.gitHost}:${repository.replace(/\.git$/, "")}.git`
      : repository;
    return { directory: ".", url, ...(branch ? { branch } : {}) };
  }

  private async status(): Promise<ProjectStatus> {
    const project = await this.project();
    const output = await this.projectCommand("status", [project]);
    try {
      return JSON.parse(output) as ProjectStatus;
    } catch {
      throw new Error(`Unexpected output from \`project status ${project}\`:\n${output.trim()}`);
    }
  }

  /**
   * Runs an allow-listed `project` subcommand. When the server stops at a
   * "which one?" menu (several WordPress/database containers or databases),
   * the profile's coolify selection names the entry to use — or, in an
   * interactive run, the user picks it — and the command is re-run with that
   * entry's number on stdin. The server exits at an
   * unanswered menu before exporting anything, so a re-run leaves nothing
   * behind, and an entry is only ever picked by name, never by position.
   */
  private async projectCommand(subcommand: string, args: string[] = [], spinner: Spinner | null = null): Promise<string> {
    if (!READ_ONLY_SUBCOMMANDS.has(subcommand)) throw new Error(`A-CLI policy is pull-only: refusing to run "project ${subcommand}" on the remote server.`);
    const remoteCommand = ["project", subcommand, ...args.map(shellQuote)].join(" ");
    const answers: number[] = [];
    for (;;) {
      try {
        return String(await this.run("ssh", ["-T", ...buildSshArgs(this.profile.ssh, remoteCommand)], { stdin: answers.map((answer) => `${answer}\n`).join("") }));
      } catch (error: any) {
        const menu = parseSelectionMenu(`${error?.stdout || ""}\n${error?.stderr || ""}`);
        if (!menu || answers.length >= SELECTION_MENUS.length) throw error;
        answers.push(await this.chooseFromMenu(menu, spinner));
      }
    }
  }

  private async chooseFromMenu(menu: SelectionMenu, spinner: Spinner | null): Promise<number> {
    const wanted = this.profile.coolify?.[menu.key] || this.chosen[menu.key];
    const available = menu.options.map((option) => option.names.at(-1)).join(", ");
    if (!wanted && this.chooseOption) {
      spinner?.stop?.(`The server needs to know which of the ${menu.what} to use.`);
      const number = await this.chooseOption(menu, { project: await this.project() });
      const picked = menu.options.find((option) => option.number === number);
      if (!picked) throw new Error(`Invalid selection: ${number}.`);
      this.chosen[menu.key] = picked.names.at(-1)!;
      this.onSelection?.(menu.key, this.chosen[menu.key]!);
      spinner?.start?.("Continuing export...");
      return number;
    }
    if (!wanted) {
      throw new CliError(`Project "${this.profile.coolify!.project}" has several ${menu.what} on the server: ${available}.`, {
        code: "COOLIFY_SELECTION_REQUIRED",
        hint: `Run once without --yes to choose the one WordPress uses (A-CLI remembers it in the project's .acli/config.yaml), or set project.selections.${menu.key} there yourself, then resume.`,
      });
    }
    const match = menu.options.find((option) => option.names.includes(wanted));
    if (!match) {
      throw new CliError(`The remembered ${menu.key} "${wanted}" is not one of the ${menu.what} on the server: ${available}.`, {
        code: "COOLIFY_SELECTION_NOT_FOUND",
        hint: `Update or remove project.selections.${menu.key} in the project's .acli/config.yaml.`,
      });
    }
    return match.number;
  }

  private async download(remotePath: string, workDir: string): Promise<string> {
    const { ssh } = this.profile;
    const localPath = path.join(workDir, path.posix.basename(remotePath));
    await this.run("scp", [...scpConnectionArgs(ssh), `${ssh.username}@${ssh.host}:${remotePath}`, localPath]);
    await fs.chmod(localPath, 0o600).catch(() => {});
    return localPath;
  }

  /**
   * Rejects an archive before extraction unless every entry is a regular
   * file or directory under the expected top-level path: no absolute paths,
   * no "..", no symlinks or hard links that could redirect a later write.
   */
  private async assertSafeArchive(archive: string, isExpected: (entry: string) => boolean): Promise<void> {
    const entries = String(await this.run("tar", ["-tzf", archive])).split(/\r?\n/).filter(Boolean);
    for (const entry of entries) {
      if (entry.startsWith("/") || entry.split("/").includes("..") || !isExpected(entry)) throw new Error(`Refusing to extract unexpected archive entry: ${JSON.stringify(entry)}.`);
    }
    const listing = String(await this.run("tar", ["-tvzf", archive])).split(/\r?\n/).filter(Boolean);
    if (listing.some((line) => !/^[-d]/.test(line))) throw new Error("Refusing to extract an archive that contains links or special files.");
  }

  private async workDir(targetDir: string): Promise<string> {
    const directory = path.join(targetDir, ".acli", "tmp");
    await fs.ensureDir(directory);
    await fs.chmod(directory, 0o700).catch(() => {});
    return directory;
  }
}
