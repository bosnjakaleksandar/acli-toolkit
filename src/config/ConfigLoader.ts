import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { BUILT_IN_CONFIG } from "./defaults.ts";
import { getProjectConfigPath, getUserConfigPath } from "./paths.ts";
import { isConfigTrusted } from "./TrustStore.ts";
import { findSecretReferencePath, resolveReferences } from "./references.ts";
import { validateConfig } from "./schema.ts";
import { deepMerge } from "./merge.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  env?: Record<string, string | undefined>;
  resolveSecrets?: boolean;
}

export interface LoadConfigResult {
  config: AcliConfig;
  rawConfig: AcliConfig;
  sources: Array<{ name: string; value: AcliConfig }>;
}

export async function loadConfig({ cwd = process.cwd(), configPath, env = process.env, resolveSecrets = true }: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const sources: Array<{ name: string; value: AcliConfig }> = [{ name: "built-in defaults", value: structuredClone(BUILT_IN_CONFIG) as AcliConfig }];
  // Only the project-scoped file (or an explicit --config, which behaves like
  // one) may declare a `project:` link — the user-level config is shared
  // across every project on the machine, so a link there could never be
  // meaningful. `autoDiscovered` marks the one candidate that A-CLI reads
  // without being asked to: the project config found by walking up from cwd.
  // Unlike an explicit --config (the user pointed at it on purpose) or the
  // user-level config (lives on this machine, not in a repo someone else
  // wrote), an auto-discovered project config may have arrived via `git
  // clone` — see the trust check below.
  const candidates = configPath
    ? [{ name: `explicit config (${path.resolve(cwd, configPath)})`, path: path.resolve(cwd, configPath), required: true, allowProjectKey: true, autoDiscovered: false }]
    : [
        { name: `user config (${getUserConfigPath()})`, path: getUserConfigPath(), required: false, allowProjectKey: false, autoDiscovered: false },
        { name: `project config (${getProjectConfigPath(cwd)})`, path: getProjectConfigPath(cwd), required: false, allowProjectKey: true, autoDiscovered: true },
      ];

  for (const candidate of candidates) {
    if (!(await fs.pathExists(candidate.path))) {
      if (candidate.required) throw new Error(`Configuration file not found: ${candidate.path}`);
      continue;
    }
    const rawText = await fs.readFile(candidate.path, "utf8");
    const value = parseConfigText(rawText, candidate.path);
    validateConfig(value, candidate.name, { allowProjectKey: candidate.allowProjectKey });

    if (resolveSecrets && candidate.autoDiscovered) {
      const secretPath = findSecretReferencePath(value);
      if (secretPath) {
        const trusted = env.ACLI_TRUST_PROJECT_CONFIG === "1" || (await isConfigTrusted(candidate.path, rawText, env));
        if (!trusted) {
          throw new Error(
            `Refusing to resolve secrets from ${candidate.path}: it declares a secret command or environment-variable reference at "${secretPath}".\n` +
              `This file lives in the current project directory, which may have come from somewhere else (e.g. git clone) rather than from you — A-CLI will not execute commands from it automatically.\n` +
              `If you trust this file, run "acli config trust" to approve it, or set ACLI_TRUST_PROJECT_CONFIG=1 to bypass this check for a single command.`,
          );
        }
      }
    }

    sources.push({ name: candidate.name, value });
  }

  const config = sources.reduce((result, source) => deepMerge(result, source.value), {} as AcliConfig);
  validateConfig(config, "resolved configuration", { allowProjectKey: true });
  const resolved = resolveSecrets ? (resolveReferences(config, { env }) as AcliConfig) : config;
  return { config: resolved, rawConfig: config, sources };
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
