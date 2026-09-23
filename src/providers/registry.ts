import { runCommand } from "../system/commandRunner.ts";
import { sshProvider } from "./ssh/index.ts";
import { coolifyProvider } from "./coolify/index.ts";
import type { Profile, ResolvedProfile } from "../core/model/Profile.ts";
import type { ProviderDefinition, RemoteBackend, RemoteBackendOptions } from "./contract.ts";

export type { ProviderDefinition, RemoteBackend, RemoteBackendFactory, RemoteBackendOptions, RemoteGitOrigin, SyncFilesOptions } from "./contract.ts";

const PROVIDERS: Record<string, ProviderDefinition> = Object.fromEntries([sshProvider, coolifyProvider].map((provider) => [provider.name, provider]));

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/** The provider for a profile's `provider` field ("ssh" when absent), or undefined if unknown. */
export function getProvider(profile: Pick<Profile, "provider"> | null | undefined): ProviderDefinition | undefined {
  return PROVIDERS[profile?.provider ?? "ssh"];
}

export function providerFor(profile: Pick<Profile, "provider">): ProviderDefinition {
  const provider = getProvider(profile);
  if (!provider) throw new Error(`Unknown profile provider "${profile.provider}". Expected one of: ${PROVIDER_NAMES.join(", ")}.`);
  return provider;
}

/** Picks the backend for a resolved profile's `provider`. */
export function createRemoteBackend(profile: ResolvedProfile, options: RemoteBackendOptions = {}, runner: typeof runCommand = runCommand): RemoteBackend {
  return providerFor(profile).create(profile, runner, options);
}
