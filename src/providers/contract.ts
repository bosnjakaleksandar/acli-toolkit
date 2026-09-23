import type { runCommand } from "../system/commandRunner.ts";
import type { CoolifySelection, Profile, ResolvedProfile } from "../core/model/Profile.ts";
import type { RemoteFacts } from "../core/model/RemoteFacts.ts";
import type { Spinner } from "../environments/EnvironmentService.ts";

// The contract between the import/pull core and a remote provider. The core
// (src/wordpress, src/cli) depends only on this file and registry.ts; each
// provider lives in its own folder and never reaches into another.

export interface SyncFilesOptions {
  /** File targets to fetch; all targets the backend supports when omitted. */
  directories?: string[];
}

export interface RemoteGitOrigin {
  /** Discovery path relative to the WordPress root; "." for the root itself. */
  directory: string;
  url: string;
  /** Branch actually deployed remotely, when the backend knows it. */
  branch?: string;
}

/**
 * Every read-only operation the import and pull workflows need from a
 * remote WordPress site. `SshHost` implements it over plain SSH access;
 * `CoolifyProjectHost` over the Coolify staging server's `project` CLI.
 * Implementations never change remote state.
 */
export interface RemoteBackend {
  requiredTools(ctx: { environment?: string; skipFiles?: boolean }): string[];
  preflight(ctx: { environment?: string; skipFiles?: boolean }): Promise<void>;
  /** File target names this backend can fetch (e.g. uploads, plugins, themes). */
  fileTargets(): string[];
  syncFiles(targetDir: string, spinner: Spinner | null, options?: SyncFilesOptions): Promise<void>;
  /** Writes the remote database to `<targetDir>/staging.sql` (mode 0600). */
  exportDatabase(targetDir: string, spinner: Spinner | null): Promise<void>;
  getRemoteFacts(): Promise<RemoteFacts>;
  discoverGit(): Promise<RemoteGitOrigin | null>;
  /** Projects on the server the user can import, when the server can list them. */
  listProjects?(): Promise<string[]>;
}

export interface RemoteBackendOptions {
  /** Whether the backend may prompt the user (false for --yes / --non-interactive runs). */
  interactive?: boolean;
  /** Called when the user answers a server prompt, so the caller can remember it in the project link. */
  onSelection?: (key: keyof CoolifySelection, value: string) => void;
  /** The server's project list when the caller already fetched it this run (saves a round trip). */
  knownProjects?: string[];
}

/** The project a profile is resolved for: the local name plus what the project link knows about it on the server. */
export interface ProjectTarget {
  projectName: string;
  /** The project's name on the server, when it differs from projectName. */
  remoteProject?: string;
  selections?: CoolifySelection;
}

export type RemoteBackendFactory = (profile: ResolvedProfile, options?: RemoteBackendOptions) => RemoteBackend;

export interface ProviderPlanContext {
  skipFiles?: boolean;
  skipDatabase?: boolean;
}

/**
 * Everything the core needs to know about one kind of remote, so that no
 * code outside src/providers/<name>/ branches on a profile's `provider`.
 * A provider could move into its own package by exporting this object.
 */
export interface ProviderDefinition {
  /** The profile's `provider` value. */
  name: string;
  /** Top-level profile fields this provider owns, in addition to the shared ones. */
  profileKeys: string[];
  /** Validates the provider's own fields of a raw profile. */
  validate(profile: Profile, label: string, errors: string[]): void;
  /** Resolves the provider's fields for one project; `render` substitutes `{projectName}`. */
  resolve(profile: Profile, render: (value: unknown) => string, target: ProjectTarget): Pick<ResolvedProfile, "remote" | "files" | "coolify">;
  /** One-line description for profile lists (after the host). */
  describe(profile: Profile): string;
  /** Lines for the "Selected profile" note (after the Remote line). */
  summary(profile: Profile): string[];
  /** Provider-specific fields of an import --dry-run plan. */
  plan(profile: ResolvedProfile, ctx: ProviderPlanContext): Record<string, unknown>;
  /** The profile as it counts toward an import's --resume fingerprint. */
  fingerprint(profile: Record<string, any>): unknown;
  create(profile: ResolvedProfile, runner: typeof runCommand, options: RemoteBackendOptions): RemoteBackend;
}
