import path from "node:path";
import fs from "fs-extra";
import { readConfigFile } from "../config/ConfigLoader.ts";
import { getProjectConfigPath, getUserConfigPath } from "../config/paths.ts";
import { validateConfig, validateProfileConfig } from "../config/schema.ts";
import { readWritableConfig, writeConfigAtomic } from "../config/ConfigWriter.ts";
import type { Profile } from "../core/model/Profile.ts";
import { isSafeSshHostAlias } from "../system/safety.ts";

export interface ProfileConfigPathOptions {
  scope?: "project" | "user";
  configPath?: string;
  cwd?: string;
}

export interface ProfileWriteOptions extends ProfileConfigPathOptions {
  force?: boolean;
  allowExternal?: boolean;
}

export function resolveProfileConfigPath({ scope = "project", configPath, cwd = process.cwd() }: ProfileConfigPathOptions = {}): string {
  if (configPath) return path.resolve(cwd, configPath);
  return scope === "user" ? getUserConfigPath() : getProjectConfigPath(cwd);
}

export async function saveProfile(name: string, profile: Profile, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(name);
  validateProfileConfig(profile, `profile "${name}"`);
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (config.profiles?.[name] && !options.force) throw new Error(`Profile "${name}" already exists in ${filePath}. Use --force to replace it.`);
  config.profiles ||= {};
  config.profiles[name] = profile;
  validateConfig(config, filePath, { allowProjectKey: true });
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function deleteProfile(name: string, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(name);
  const filePath = resolveProfileConfigPath(options);
  if (!(await fs.pathExists(filePath))) throw new Error(`Configuration file not found: ${filePath}`);
  const config = await readConfigFile(filePath);
  if (!config.profiles?.[name]) throw new Error(`Profile "${name}" was not found in ${filePath}.`);
  const references = findProfileReferences(config, name);
  if (references.length && !options.force) {
    throw new Error(`Profile "${name}" is still referenced by ${references.join(", ")}. Update those references first, or pass --force to clear them while deleting.`);
  }
  if (options.force) clearProfileReferences(config, name);
  delete config.profiles[name];
  validateConfig(config, filePath, { allowProjectKey: true });
  await writeConfigAtomic(filePath, config);
  return filePath;
}

/**
 * Renames a profile within a single config file (the "project" or "user"
 * scope resolved from options — never both, mirroring saveProfile/deleteProfile).
 * Also repoints anything else in that same file that names the profile —
 * `defaults.profile`, any preset's `profile` field, and `project.profile` —
 * so a rename can't silently leave a dangling reference to the old name.
 */
export async function renameProfile(oldName: string, newName: string, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(oldName);
  validateProfileName(newName);
  const filePath = resolveProfileConfigPath(options);
  if (!(await fs.pathExists(filePath))) throw new Error(`Configuration file not found: ${filePath}`);
  const config = await readConfigFile(filePath);
  if (!config.profiles?.[oldName]) throw new Error(`Profile "${oldName}" was not found in ${filePath}.`);
  if (config.profiles[newName] && !options.force) throw new Error(`Profile "${newName}" already exists in ${filePath}. Use --force to replace it.`);
  config.profiles[newName] = config.profiles[oldName];
  delete config.profiles[oldName];
  if (config.defaults?.profile === oldName) config.defaults.profile = newName;
  for (const preset of Object.values(config.presets || {})) {
    if (preset && typeof preset === "object" && (preset as any).profile === oldName) (preset as any).profile = newName;
  }
  if (typeof config.project?.profile === "string" && config.project.profile === oldName) config.project.profile = newName;
  validateConfig(config, filePath, { allowProjectKey: true });
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function setDefaultProfile(name: string, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(name);
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (!config.profiles?.[name] && !options.allowExternal) throw new Error(`Profile "${name}" is not defined in ${filePath}.`);
  config.defaults ||= {};
  config.defaults.profile = name;
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function clearDefaultProfile(options: ProfileConfigPathOptions = {}): Promise<string> {
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (config.defaults) delete config.defaults.profile;
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function setProfileGitSshHostAlias(name: string, alias: string | null, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(name);
  if (alias !== null && !isSafeSshHostAlias(alias)) throw new Error("Git SSH host alias may contain only letters, numbers, dots, dashes, and underscores.");
  const filePath = resolveProfileConfigPath(options);
  if (!(await fs.pathExists(filePath))) throw new Error(`Configuration file not found: ${filePath}`);
  const config = await readConfigFile(filePath);
  const profile = config.profiles?.[name];
  if (!profile) throw new Error(`Profile "${name}" was not found in ${filePath}.`);
  profile.git ||= {};
  if (alias === null) delete profile.git.sshHostAlias;
  else profile.git.sshHostAlias = alias;
  validateConfig(config, filePath, { allowProjectKey: true });
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export function validateProfileName(name: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name || "")) throw new Error("Profile name may contain lowercase letters, numbers, dashes, and underscores.");
}

function findProfileReferences(config: Awaited<ReturnType<typeof readConfigFile>>, name: string): string[] {
  const references: string[] = [];
  if (config.defaults?.profile === name) references.push("defaults.profile");
  for (const [presetName, preset] of Object.entries(config.presets || {})) {
    if (preset?.profile === name) references.push(`presets.${presetName}.profile`);
  }
  if (config.project?.profile === name) references.push("project.profile");
  return references;
}

function clearProfileReferences(config: Awaited<ReturnType<typeof readConfigFile>>, name: string): void {
  if (config.defaults?.profile === name) delete config.defaults.profile;
  for (const preset of Object.values(config.presets || {})) if (preset?.profile === name) delete preset.profile;
  if (config.project?.profile === name) delete config.project.profile;
}
