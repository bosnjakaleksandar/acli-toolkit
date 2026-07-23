import path from "node:path";
import fs from "fs-extra";
import { getProjectConfigPath, getUserConfigPath, readConfigFile, validateConfig, validateProfileConfig } from "./ConfigService.ts";
import { readWritableConfig, writeConfigAtomic } from "./ConfigFileService.ts";
import type { Profile } from "../core/model/ResolvedProfile.ts";

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
  delete config.profiles[name];
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

export function validateProfileName(name: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name || "")) throw new Error("Profile name may contain lowercase letters, numbers, dashes, and underscores.");
}
