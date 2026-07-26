import { Registry } from "../../core/Registry.ts";
import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";

/**
 * A pluggable way to fetch an existing WordPress site's files and database
 * dump onto disk, before the shared migration pipeline (table-prefix
 * detection, environment scaffold, import + search-replace) takes over.
 *
 * `profile` and `ssh` (a saved staging profile, or a one-off SSH target)
 * delegate to the existing, already-proven `acli create --existing`
 * machinery unchanged — see src/commands/import.ts. The sources registered
 * here (local, git, sql, zip) are new: they don't need a remote host at
 * all, just files that already exist somewhere reachable from this
 * machine.
 */
export interface ImportSourceContext {
  targetDir: string;
  sqlFile?: string;
  [key: string]: unknown;
}

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
  /** Optional richer --dry-run plan (e.g. remote host, required tools) — falls back to the generic {source, project, localEnvironment} plan when absent. */
  buildPlan?(ctx: ImportSourceContext): unknown;
}

export class ImportSourceRegistry extends Registry<ImportSource> {
  constructor() {
    super("import source");
  }
}
