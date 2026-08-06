import path from "node:path";
import fs from "fs-extra";

const DB_CONSTANTS = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST"];

export interface WpConfigRecoveryState {
  configPath: string;
  backupPath: string | null;
  original: string | null;
}

/** Temporarily moves wp-config.php out of the way so the environment can
 * regenerate valid DB credentials, while keeping a mode-0600 recovery copy. */
export async function prepareWpConfigRecovery(targetDir: string): Promise<WpConfigRecoveryState> {
  const configPath = path.join(targetDir, "wp-config.php");
  if (!(await fs.pathExists(configPath))) return { configPath, backupPath: null, original: null };

  const original = await fs.readFile(configPath, "utf8");
  const backupPath = path.join(targetDir, ".acli", "recovery", "wp-config.php.before-db-recovery");
  await fs.ensureDir(path.dirname(backupPath));
  await fs.writeFile(backupPath, original, { mode: 0o600 });
  await fs.remove(configPath);
  return { configPath, backupPath, original };
}

/** Restores all user customizations, taking only the freshly generated DB
 * constants from the environment-produced config. Safe to call repeatedly. */
export async function restoreWpConfigAfterRecovery(state: WpConfigRecoveryState): Promise<void> {
  if (state.original === null) return;
  const generated = await fs.readFile(state.configPath, "utf8").catch(() => null);
  if (!generated) {
    await fs.writeFile(state.configPath, state.original, { mode: 0o600 });
    return;
  }

  let restored = state.original;
  for (const key of DB_CONSTANTS) {
    const generatedDefinition = findDefinition(generated, key);
    if (!generatedDefinition) continue;
    const existingPattern = definitionPattern(key);
    restored = existingPattern.test(restored)
      ? restored.replace(existingPattern, generatedDefinition)
      : insertAfterPhpOpen(restored, generatedDefinition);
  }
  await fs.writeFile(state.configPath, restored, { mode: 0o600 });
}

function findDefinition(content: string, key: string): string | null {
  return content.match(definitionPattern(key))?.[0]?.trim() || null;
}

function definitionPattern(key: string): RegExp {
  return new RegExp(`^\\s*define\\s*\\(\\s*['"]${key}['"]\\s*,.*?\\);\\s*$`, "m");
}

function insertAfterPhpOpen(content: string, definition: string): string {
  return content.includes("<?php") ? content.replace("<?php", `<?php\n${definition}`) : `<?php\n${definition}\n${content}`;
}
