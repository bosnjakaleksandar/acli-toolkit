/**
 * A pluggable way to fetch an existing WordPress site's files and database
 * dump onto disk, before the shared migration pipeline (table-prefix
 * detection, environment scaffold, import + search-replace) takes over.
 *
 * `profile` and `ssh` (a saved staging profile, or a one-off SSH target)
 * delegate to the existing, already-proven `acli create --existing`
 * machinery unchanged — see src/commands/import.js. The sources registered
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
}

export class ImportSourceRegistry {
  #sources = new Map<string, ImportSource>();

  register(source: ImportSource): void {
    if (this.#sources.has(source.id)) throw new Error(`An import source with id "${source.id}" is already registered.`);
    this.#sources.set(source.id, source);
  }

  get(id: string): ImportSource {
    const source = this.#sources.get(id);
    if (!source) throw new Error(`Unknown import source "${id}". Available: ${[...this.#sources.keys()].join(", ")}.`);
    return source;
  }

  list(): ImportSource[] {
    return [...this.#sources.values()];
  }
}
