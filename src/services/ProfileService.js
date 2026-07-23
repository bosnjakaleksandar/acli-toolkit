import path from "node:path";
import fs from "fs-extra";
import { getProjectConfigPath, getUserConfigPath, readConfigFile, validateConfig, validateProfileConfig } from "./ConfigService.js";
import { readWritableConfig, writeConfigAtomic } from "./ConfigFileService.js";

export function resolveProfileConfigPath({ scope = "project", configPath, cwd = process.cwd() } = {}) {
  if (configPath) return path.resolve(cwd, configPath);
  return scope === "user" ? getUserConfigPath() : getProjectConfigPath(cwd);
}

export async function saveProfile(name, profile, options = {}) {
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

export async function deleteProfile(name, options = {}) {
  validateProfileName(name);
  const filePath = resolveProfileConfigPath(options);
  if (!(await fs.pathExists(filePath))) throw new Error(`Configuration file not found: ${filePath}`);
  const config = await readConfigFile(filePath);
  if (!config.profiles?.[name]) throw new Error(`Profile "${name}" was not found in ${filePath}.`);
  delete config.profiles[name];
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function setDefaultProfile(name, options = {}) {
  validateProfileName(name);
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (!config.profiles?.[name] && !options.allowExternal) throw new Error(`Profile "${name}" is not defined in ${filePath}.`);
  config.defaults ||= {};
  config.defaults.profile = name;
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export async function clearDefaultProfile(options = {}) {
  const filePath = resolveProfileConfigPath(options);
  const config = await readWritableConfig(filePath, { allowProjectKey: true });
  if (config.defaults) delete config.defaults.profile;
  await writeConfigAtomic(filePath, config);
  return filePath;
}

export function validateProfileName(name) {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name || "")) throw new Error("Profile name may contain lowercase letters, numbers, dashes, and underscores.");
}
