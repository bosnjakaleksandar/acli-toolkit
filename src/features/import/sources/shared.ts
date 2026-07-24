import path from "node:path";
import fs from "fs-extra";
import { CliError } from "../../../core/errors.ts";

/**
 * Copies a WordPress `wp-content` directory into `<targetDir>/wp-content`.
 * `sourceRoot` may either contain a `wp-content` subdirectory (the common
 * shape for a repo/zip backup of a site) or, failing that, is treated as
 * `wp-content` itself directly (a bundle that only ever held the content
 * directory). Throws with a clear, actionable message if neither shape is
 * found, rather than silently copying the wrong thing.
 */
export async function copyWordPressContent(sourceRoot: string, targetDir: string): Promise<void> {
  const nestedContentDir = path.join(sourceRoot, "wp-content");
  const sourceIsWpContent = await looksLikeWpContent(sourceRoot);
  const sourceDir = (await fs.pathExists(nestedContentDir)) ? nestedContentDir : sourceIsWpContent ? sourceRoot : null;

  if (!sourceDir) {
    throw new CliError(`Could not find a "wp-content" directory at or under ${sourceRoot}.`, {
      code: "WP_CONTENT_NOT_FOUND",
      hint: "The source must contain a wp-content/ directory (uploads, plugins, themes), or be that directory itself.",
    });
  }

  await fs.ensureDir(path.join(targetDir, "wp-content"));
  await fs.copy(sourceDir, path.join(targetDir, "wp-content"), { overwrite: true });
}

async function looksLikeWpContent(dir: string): Promise<boolean> {
  const markers = ["themes", "plugins", "uploads"];
  for (const marker of markers) {
    if (await fs.pathExists(path.join(dir, marker))) return true;
  }
  return false;
}

/** Copies a user-supplied .sql file to the conventional `<targetDir>/staging.sql` every import source and the shared migration pipeline expect. */
export async function copySqlFile(sqlFile: string | undefined, targetDir: string): Promise<{ hasDump: boolean }> {
  if (!sqlFile) return { hasDump: false };
  const resolved = path.resolve(sqlFile.replace(/^~/, process.env.HOME || ""));
  if (!(await fs.pathExists(resolved))) {
    throw new CliError(`SQL dump file was not found: ${sqlFile}`, { code: "SQL_FILE_NOT_FOUND" });
  }
  const destination = path.join(targetDir, "staging.sql");
  await fs.copy(resolved, destination);
  // A full database dump may include real user password hashes — tighten
  // permissions regardless of the source file's own mode or umask.
  await fs.chmod(destination, 0o600);
  return { hasDump: true };
}
