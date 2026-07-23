import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { CONFIG_VERSION } from "../config/defaults.ts";
import { readConfigFile, validateConfig } from "./ConfigService.ts";
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

/** Atomic (write-then-rename) write of a config document, mode 0600. */
export async function writeConfigAtomic(filePath: string, config: AcliConfig): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, YAML.stringify(config), { mode: 0o600 });
  await fs.rename(temporary, filePath);
}
