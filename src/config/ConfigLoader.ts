import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { BUILT_IN_CONFIG } from "./defaults.ts";
import { getProjectConfigPath, getUserConfigPath } from "./paths.ts";
import { validateConfig } from "./schema.ts";
import { deepMerge } from "./merge.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
}

export interface LoadConfigResult {
  config: AcliConfig;
  sources: Array<{ name: string; value: AcliConfig }>;
}

/**
 * Loads built-in defaults, then the user config, then the project's
 * `.acli/config.yaml` (or a single explicit --config file instead of both).
 *
 * Profiles and the default profile live only in the user config: they
 * describe how *this machine* reaches a server, and a project config found
 * in the working directory (possibly from `git clone`) must not be able to
 * redirect a pull to another server. The project config holds the project
 * link plus create defaults and presets.
 */
export async function loadConfig({ cwd = process.cwd(), configPath }: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const sources: Array<{ name: string; value: AcliConfig }> = [{ name: "built-in defaults", value: structuredClone(BUILT_IN_CONFIG) as AcliConfig }];
  const candidates = configPath
    ? [{ name: `explicit config (${path.resolve(cwd, configPath)})`, path: path.resolve(cwd, configPath), required: true, allowProjectKey: true, isProject: false }]
    : [
        { name: `user config (${getUserConfigPath()})`, path: getUserConfigPath(), required: false, allowProjectKey: false, isProject: false },
        { name: `project config (${getProjectConfigPath(cwd)})`, path: getProjectConfigPath(cwd), required: false, allowProjectKey: true, isProject: true },
      ];

  for (const candidate of candidates) {
    if (!(await fs.pathExists(candidate.path))) {
      if (candidate.required) throw new Error(`Configuration file not found: ${candidate.path}`);
      continue;
    }
    const value = await readConfigFile(candidate.path);
    validateConfig(value, candidate.name, { allowProjectKey: candidate.allowProjectKey });
    if (candidate.isProject) assertNoProjectProfiles(value, candidate.path);
    sources.push({ name: candidate.name, value });
  }

  const config = sources.reduce((result, source) => deepMerge(result, source.value), {} as AcliConfig);
  validateConfig(config, "resolved configuration", { allowProjectKey: true });
  return { config, sources };
}

function assertNoProjectProfiles(config: AcliConfig, filePath: string): void {
  const hasProfiles = Object.keys(config.profiles || {}).length > 0;
  const hasDefault = config.defaults?.profile !== undefined;
  if (!hasProfiles && !hasDefault) return;
  throw new Error(
    `${filePath} declares ${hasProfiles ? "profiles" : "a default profile"}, which since A-CLI 2.1 live only in the user config (${getUserConfigPath()}).\n` +
      "Recreate them with `acli profile create`, set the default with `acli profile use <name>`, then remove `profiles:` and `defaults.profile` from this file.",
  );
}

export async function readConfigFile(filePath: string): Promise<AcliConfig> {
  return parseConfigText(await fs.readFile(filePath, "utf8"), filePath);
}

function parseConfigText(text: string, filePath: string): AcliConfig {
  let parsed;
  try {
    parsed = YAML.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse configuration ${filePath}: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Configuration ${filePath} must be an object.`);
  return parsed;
}
