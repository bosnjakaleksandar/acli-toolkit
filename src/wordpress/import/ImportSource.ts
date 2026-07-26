import { Registry } from "../../core/Registry.ts";
import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";

/**
 * Union of every `acli import` flag. Declared here rather than with the
 * command because each source reads its own fields out of it in
 * `resolveOptions` — see src/cli/options.ts, which re-exports it under its
 * CLI-facing name.
 */
export interface ImportOptions {
  source?: string;
  name?: string;
  environment?: string;
  env?: string;
  mysql?: string;
  wpVersion?: string;
  dryRun?: boolean;
  resume?: boolean;
  profile?: string;
  sshHost?: string;
  sshUser?: string;
  sshPort?: string;
  sshKey?: string;
  remotePath?: string;
  dbDriver?: string;
  localPath?: string;
  repo?: string;
  branch?: string;
  zip?: string;
  sqlFile?: string;
  remoteUrl?: string;
  config?: string;
  skipFiles?: boolean;
  skipDatabase?: boolean;
  skipGitLink?: boolean;
  skipGit?: boolean;
  keepDump?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

export interface ImportSourceContext {
  targetDir: string;
  sqlFile?: string;
  [key: string]: unknown;
}

/**
 * A pluggable way to fetch an existing WordPress site's files and database
 * dump onto disk, before the shared migration pipeline (table-prefix
 * detection, environment scaffold, import + search-replace) takes over.
 *
 * `profile` and `ssh` (a saved staging profile, or a one-off SSH target)
 * reach a remote host over SSH; `local`, `git`, `sql` and `zip` need no
 * remote at all, just files already reachable from this machine. Every one
 * of them runs through the same ImportWorkflow — a source opts into the
 * steps it needs by implementing the optional methods below rather than the
 * workflow branching on which source it is running.
 */
export interface ImportSource {
  id: string;
  label: string;
  /** Copies/clones/extracts WordPress files into targetDir. A no-op for sources with no file component (e.g. "sql"). */
  fetchFiles(ctx: ImportSourceContext, spinner?: unknown): Promise<void>;
  /**
   * Produces `<targetDir>/staging.sql` if a database dump was supplied, so it
   * can flow into the same DatabaseDumpService/WordPressMigrationService
   * pipeline every import source shares. Returns whether a dump is present.
   */
  fetchDatabase(ctx: ImportSourceContext, spinner?: unknown): Promise<{ hasDump: boolean }>;
  /** Remote sources only: verifies required tools/connectivity are available before any work starts. */
  preflight?(ctx: ImportSourceContext): Promise<void>;
  /**
   * Remote sources only: authoritative table prefix / site URL read directly
   * from the remote site (e.g. via wp-cli over SSH), used in place of
   * guessing the prefix from the dump's own contents when available.
   */
  getRemoteFacts?(ctx: ImportSourceContext): Promise<RemoteFacts>;
  /** Remote sources only: writes the `.acli` project link so a later `acli pull` can re-sync from the same source. Returns the linked profile's name, or null if nothing meaningful to name. */
  linkProfile?(targetDir: string, ctx: ImportSourceContext): Promise<string | null>;
  /** Remote sources only: discovers and links the remote site's own git origin into the new local project, if any and if it looks safe to use. */
  linkGit?(targetDir: string, ctx: ImportSourceContext, spinner?: unknown): Promise<void>;
  /**
   * Resolves whichever options this source requires and weren't supplied on
   * the command line, prompting for them when interactive and throwing a
   * MissingOptionError when not — then writes them onto `ctx`. Owned by the
   * source rather than by the import command, so adding a source doesn't
   * mean adding another branch to an if-chain over source ids.
   */
  resolveOptions?(options: ImportOptions, ctx: ImportSourceContext, runOptions: { nonInteractive: boolean }): Promise<void>;
  /** Optional richer --dry-run plan (e.g. remote host, required tools) — falls back to the generic {source, project, localEnvironment} plan when absent. */
  buildPlan?(ctx: ImportSourceContext): unknown;
}

export class ImportSourceRegistry extends Registry<ImportSource> {
  constructor() {
    super("import source");
  }
}
