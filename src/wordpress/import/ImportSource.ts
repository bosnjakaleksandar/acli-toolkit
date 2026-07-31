import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";

/**
 * Public flags accepted by the profile-backed `acli import` command.
 */
export interface ImportOptions {
  name?: string;
  environment?: string;
  env?: string;
  mysql?: string;
  wpVersion?: string;
  dryRun?: boolean;
  resume?: boolean;
  profile?: string;
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
  [key: string]: unknown;
}

/**
 * Operations the profile-backed remote source supplies to the shared import
 * workflow. Keeping the workflow behind this contract makes its ordering
 * and resume behavior testable without a real SSH host.
 */
export interface ImportSource {
  label: string;
  /** Synchronizes the configured WordPress content into targetDir. */
  fetchFiles(ctx: ImportSourceContext, spinner?: unknown): Promise<void>;
  /**
   * Exports the remote database to `<targetDir>/staging.sql` so it can flow
   * through the migration pipeline. Returns whether a dump is present.
   */
  fetchDatabase(ctx: ImportSourceContext, spinner?: unknown): Promise<{ hasDump: boolean }>;
  /** Verifies required tools/connectivity before any project files are created. */
  preflight?(ctx: ImportSourceContext): Promise<void>;
  /**
   * Remote sources only: authoritative table prefix / site URL read directly
   * from the remote site (e.g. via wp-cli over SSH), used in place of
   * guessing the prefix from the dump's own contents when available.
   */
  getRemoteFacts?(ctx: ImportSourceContext): Promise<RemoteFacts>;
  /** Writes the `.acli` project link so a later `acli pull` can re-sync from the same profile. */
  linkProfile?(targetDir: string, ctx: ImportSourceContext): Promise<string | null>;
  /** Discovers and safely links the remote site's Git origin, when present. */
  linkGit?(targetDir: string, ctx: ImportSourceContext, spinner?: unknown): Promise<unknown>;
  /** Optional richer --dry-run plan (e.g. remote host and required tools). */
  buildPlan?(ctx: ImportSourceContext): unknown;
}
