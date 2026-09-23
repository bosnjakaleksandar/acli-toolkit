import path from "node:path";
import fs from "fs-extra";
import { readConfigFile } from "../config/ConfigLoader.ts";
import { getUserConfigPath } from "../config/paths.ts";
import { validateConfig, validateProfileConfig } from "../config/schema.ts";
import { readWritableConfig, writeConfigAtomic } from "../config/ConfigWriter.ts";
import type { Profile } from "../core/model/Profile.ts";
import { isSafeSshHostAlias } from "../system/safety.ts";

export interface ProfileConfigPathOptions {
  /** An explicit config file instead of the user config (tests, --config). */
  configPath?: string;
  cwd?: string;
}

export interface ProfileWriteOptions extends ProfileConfigPathOptions {
  force?: boolean;
}

/** Profiles live in the user config — they describe how this machine reaches a server. */
export function resolveProfileConfigPath({ configPath, cwd = process.cwd() }: ProfileConfigPathOptions = {}): string {
  return configPath ? path.resolve(cwd, configPath) : getUserConfigPath();
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

export async function setDefaultProfile(name: string, options: ProfileWriteOptions = {}): Promise<string> {
  validateProfileName(name);
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (!config.profiles?.[name]) throw new Error(`Profile "${name}" is not defined in ${filePath}.`);
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
  if (config.project?.profile === name) references.push("project.profile");
  return references;
}

function clearProfileReferences(config: Awaited<ReturnType<typeof readConfigFile>>, name: string): void {
  if (config.defaults?.profile === name) delete config.defaults.profile;
  if (config.project?.profile === name) delete config.project.profile;
}
