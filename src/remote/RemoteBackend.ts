import { runCommand } from "../system/commandRunner.ts";
import { RemoteHost } from "./RemoteHost.ts";
import { CoolifyProjectHost } from "./CoolifyProjectHost.ts";
import { askSelectionMenu } from "../ui/prompts.ts";
import type { ResolvedProfile } from "../core/model/Profile.ts";
import type { RemoteFacts } from "../core/model/RemoteFacts.ts";
import type { Spinner } from "../environments/EnvironmentService.ts";

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
 * remote WordPress site. `RemoteHost` implements it over plain SSH access;
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
}

export interface RemoteBackendOptions {
  /** Whether the backend may prompt the user (false for --yes / --non-interactive runs). */
  interactive?: boolean;
}

export type RemoteBackendFactory = (profile: ResolvedProfile, options?: RemoteBackendOptions) => RemoteBackend;

/** Picks the backend for a resolved profile's `provider`. */
export function createRemoteBackend(profile: ResolvedProfile, { interactive = false }: RemoteBackendOptions = {}, runner: typeof runCommand = runCommand): RemoteBackend {
  if (profile.provider === "coolify-cli") return new CoolifyProjectHost(profile, runner, { chooseOption: interactive ? askSelectionMenu : null });
  return new RemoteHost(profile, runner);
}
