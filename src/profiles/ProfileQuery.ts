import { loadConfig } from "../config/ConfigLoader.ts";
import { redactSecrets } from "../config/redaction.ts";
import { validateProfileConfig } from "../config/schema.ts";
import { getProvider } from "../providers/registry.ts";

export interface ProfileQueryOptions {
  config?: string;
}

export interface ProfileListRow {
  name: string;
  default: boolean;
  description: string;
}

export async function listProfiles(options: ProfileQueryOptions = {}): Promise<ProfileListRow[]> {
  const { config } = await loadConfig({ configPath: options.config });
  const current = config.defaults?.profile;
  return Object.keys(config.profiles || {}).sort().map((name) => ({
    name,
    default: name === current,
    description: describeProfile(config.profiles![name]),
  }));
}

export interface CurrentProfileResult {
  name: string | null;
  /** True when `defaults.profile` names a profile that doesn't actually exist in `profiles`. */
  missing: boolean;
  description: string | null;
}

export async function getCurrentProfile(options: ProfileQueryOptions = {}): Promise<CurrentProfileResult> {
  const { config } = await loadConfig({ configPath: options.config });
  const name = (config.defaults?.profile as string | undefined) || null;
  if (!name) return { name: null, missing: false, description: null };
  const profile = config.profiles?.[name];
  return { name, missing: !profile, description: profile ? describeProfile(profile) : null };
}

export async function inspectProfile(name: string, options: ProfileQueryOptions = {}): Promise<unknown> {
  const { config } = await loadConfig({ configPath: options.config });
  const profile = config.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found.`);
  return redactSecrets(profile);
}

export async function validateNamedProfile(name: string, options: ProfileQueryOptions = {}): Promise<void> {
  const { config } = await loadConfig({ configPath: options.config });
  const profile = config.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found.`);
  validateProfileConfig(profile, `profile "${name}"`);
}

export function describeProfile(profile: any): string {
  return `${profile.ssh?.host || "unknown host"} · ${getProvider(profile)?.describe(profile) || `unknown provider "${profile.provider}"`}`;
}
