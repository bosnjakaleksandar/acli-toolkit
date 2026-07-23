import path from "node:path";
import fs from "fs-extra";
import { getProjectConfigPath, validateProjectLinkConfig } from "./ConfigService.js";
import { readWritableConfig, writeConfigAtomic } from "./ConfigFileService.js";

/**
 * Walks upward from `cwd` looking for a `.acli/config.yaml` that declares a
 * `project:` link, the same way git discovers a repo root. Lets `acli pull`
 * work from any subdirectory of a linked project, not just its root.
 */
export async function findProjectRoot(cwd = process.cwd()) {
  let directory = path.resolve(cwd);
  while (true) {
    const configPath = getProjectConfigPath(directory);
    if (await fs.pathExists(configPath)) {
      const config = await readWritableConfig(configPath, { allowProjectKey: true });
      if (config.project) return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

export async function readLink(root) {
  const configPath = getProjectConfigPath(root);
  const config = await readWritableConfig(configPath, { allowProjectKey: true });
  return config.project || null;
}

export async function writeLink(root, link) {
  validateProjectLinkConfig(link, `project link for "${link?.name}"`);
  const configPath = getProjectConfigPath(root);
  const config = await readWritableConfig(configPath, { allowProjectKey: true });
  config.project = link;
  await writeConfigAtomic(configPath, config);
  return configPath;
}
