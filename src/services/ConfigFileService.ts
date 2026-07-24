import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { CONFIG_VERSION } from "../config/defaults.ts";
import { readConfigFile, validateConfig } from "./ConfigService.ts";
import { trustConfig } from "./ConfigTrustService.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";

/**
 * Reads a YAML config document for editing, returning an empty-but-valid
 * document when the file doesn't exist yet. Shared by ProfileService and
 * ProjectLinkService so every writer of `.acli/config.yaml` agrees on the
 * same read/validate/write path.
 */
export async function readWritableConfig(filePath: string, { allowProjectKey = false }: { allowProjectKey?: boolean } = {}): Promise<AcliConfig> {
  if (!(await fs.pathExists(filePath))) return { version: CONFIG_VERSION, profiles: {} };
  const config = await readConfigFile(filePath);
  validateConfig(config, filePath, { allowProjectKey });
  return config;
}

/**
 * Atomic (write-then-rename) write of a config document, mode 0600.
 * Also records the written content as trusted (see ConfigTrustService) —
 * a config A-CLI itself just authored is inherently trustworthy, so this
 * lets `loadConfig` distinguish it from a project config that merely
 * appeared in the working directory (e.g. via `git clone`).
 */
export async function writeConfigAtomic(filePath: string, config: AcliConfig): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  const content = YAML.stringify(config);
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, { mode: 0o600 });
  await fs.rename(temporary, filePath);
  await trustConfig(filePath, content);
}
