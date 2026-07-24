import path from "node:path";
import fs from "fs-extra";
import { getProjectConfigPath, validateProjectLinkConfig } from "./ConfigService.ts";
import { readWritableConfig, writeConfigAtomic } from "./ConfigFileService.ts";
import { validateProjectName } from "./ProjectValidationService.ts";
import type { ProjectLink } from "../core/model/AcliConfig.ts";

/**
 * Walks upward from `cwd` looking for a `.acli/config.yaml` that declares a
 * `project:` link, the same way git discovers a repo root. Lets `acli pull`
 * work from any subdirectory of a linked project, not just its root.
 */
export async function findProjectRoot(cwd: string = process.cwd()): Promise<string | null> {
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

export async function readLink(root: string): Promise<ProjectLink | null> {
  const configPath = getProjectConfigPath(root);
  const config = await readWritableConfig(configPath, { allowProjectKey: true });
  return config.project || null;
}

export async function writeLink(root: string, link: ProjectLink): Promise<string> {
  const nameError = validateProjectName(link?.name);
  if (nameError) throw new Error(nameError);
  validateProjectLinkConfig(link, `project link for "${link?.name}"`);
  const configPath = getProjectConfigPath(root);
  const config = await readWritableConfig(configPath, { allowProjectKey: true });
  config.project = link;
  await writeConfigAtomic(configPath, config);
  await ensureGitignoreExcludesAcli(root);
  return configPath;
}

/**
 * `link` (and `create --existing`) write .acli/config.yaml into a directory
 * that may already be a tracked git repo the user didn't scaffold with
 * A-CLI — nothing else would ever add `.acli/` to that repo's .gitignore.
 * Idempotent: does nothing if the file already excludes it (however it's
 * written) or doesn't exist yet, in which case it's just created.
 */
async function ensureGitignoreExcludesAcli(root: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  const content = (await fs.pathExists(gitignorePath)) ? await fs.readFile(gitignorePath, "utf8") : "";
  if (/(^|\n)\.acli\/?\s*($|\n)/.test(content)) return;
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? "" : "\n";
  await fs.appendFile(gitignorePath, `${prefix}.acli/\n`);
}
