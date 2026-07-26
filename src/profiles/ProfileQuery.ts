import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { loadConfig } from "../config/ConfigLoader.ts";
import { findLiteralSecretFields, redactSecrets } from "../config/redaction.ts";
import { validateProfileConfig } from "../config/schema.ts";

export interface ProfileQueryOptions {
  config?: string;
}

export interface ProfileListRow {
  name: string;
  default: boolean;
  description: string;
}

export async function listProfiles(options: ProfileQueryOptions = {}): Promise<ProfileListRow[]> {
  const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false });
  const current = rawConfig.defaults?.profile;
  return Object.keys(rawConfig.profiles || {}).sort().map((name) => ({
    name,
    default: name === current,
    description: describeProfile(rawConfig.profiles![name]),
  }));
}

export interface CurrentProfileResult {
  name: string | null;
  /** True when `defaults.profile` names a profile that doesn't actually exist in `profiles`. */
  missing: boolean;
  description: string | null;
}

export async function getCurrentProfile(options: ProfileQueryOptions = {}): Promise<CurrentProfileResult> {
  const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false });
  const name = (rawConfig.defaults?.profile as string | undefined) || null;
  if (!name) return { name: null, missing: false, description: null };
  const profile = rawConfig.profiles?.[name];
  return { name, missing: !profile, description: profile ? describeProfile(profile) : null };
}

export async function inspectProfile(name: string, options: ProfileQueryOptions = {}): Promise<unknown> {
  const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false });
  const profile = rawConfig.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found.`);
  return redactSecrets(profile);
}

export async function validateNamedProfile(name: string, options: ProfileQueryOptions = {}): Promise<void> {
  const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false });
  const profile = rawConfig.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found.`);
  validateProfileConfig(profile, `profile "${name}"`);
}

export interface ExportedProfile {
  yaml: string;
  /** Machine-specific literal values (see findLiteralSecretFields) worth warning about before sharing this export. */
  literalSecretPaths: string[];
}

export async function exportProfile(name: string, options: ProfileQueryOptions = {}): Promise<ExportedProfile> {
  const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false });
  const profile = rawConfig.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found.`);
  return { yaml: YAML.stringify(profile), literalSecretPaths: findLiteralSecretFields(profile) };
}

export interface ImportableProfile {
  name: string;
  profile: unknown;
}

/**
 * Reads and resolves a portable profile file for `profile import` — handles
 * every shape `profile export` (or a hand-authored file) might produce: a
 * `profile:`-wrapped document, a `profiles:` map (requiring `name` when it
 * holds more than one), or a bare profile document with no wrapper at all.
 * Validates the resolved profile before returning it, so a caller never
 * receives something saveProfile() would just reject anyway.
 */
export async function readImportableProfile(filePath: string, requestedName?: string): Promise<ImportableProfile> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!(await fs.pathExists(resolvedPath))) throw new Error(`File not found: ${resolvedPath}`);
  const document = YAML.parse(await fs.readFile(resolvedPath, "utf8"));

  let profile = document?.profile;
  let name = requestedName;
  if (!profile && document?.profiles) {
    const keys = Object.keys(document.profiles);
    if (name && document.profiles[name]) profile = document.profiles[name];
    else if (keys.length === 1 && keys[0]) { profile = document.profiles[keys[0]]; name = name || keys[0]; }
    else throw new Error(`${resolvedPath} contains multiple profiles (${keys.join(", ")}). Pass the one to import as <name>.`);
  }
  if (!profile) profile = document;

  const resolvedName = name || path.basename(resolvedPath).replace(/\.(profile\.)?ya?ml$/i, "");
  validateProfileConfig(profile as any, `profile ${resolvedPath}`);
  return { name: resolvedName, profile };
}

export function describeProfile(profile: any): string {
  return `${profile.ssh?.host || "unknown host"} · ${profile.database?.executable === "auto" ? "MariaDB/MySQL" : profile.database?.driver || "unknown DB"} · ${profile.files?.transport || "rsync"}`;
}
