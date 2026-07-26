import path from "node:path";
import fs from "fs-extra";
import os from "node:os";
import { runCommand } from "../../../system/commandRunner.ts";
import { toolExists } from "../../../system/toolCheck.ts";
import { CliError, describeError, MissingOptionError } from "../../../core/errors.ts";
import { askRequiredText } from "../../../ui/prompts.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import { copyWordPressContent, copySqlFile } from "./fileCopy.ts";

interface ZipContext extends ImportSourceContext {
  zipFile?: string;
}

/**
 * `unzip` already strips `../`-traversal entries by default on the systems
 * this tool targets, so this is defense-in-depth rather than the primary
 * guard — but a zip file is untrusted input by design (a hosting-panel
 * export from anywhere), so checking its entry list before extraction costs
 * little and doesn't depend on assumptions about `unzip`'s current defaults.
 */
async function assertSafeZipEntries(zipPath: string, originalPath: string): Promise<void> {
  let listing: string;
  try {
    listing = (await runCommand("unzip", ["-Z1", zipPath])) as string;
  } catch (error) {
    throw new CliError(`Failed to read zip entry list for ${originalPath}: ${describeError(error)}`, { code: "ZIP_EXTRACT_FAILED" });
  }
  const unsafeEntries = listing
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry && (entry.startsWith("/") || entry.split("/").includes("..")));
  if (unsafeEntries.length) {
    throw new CliError(`Refusing to extract ${originalPath}: it contains path-traversal entries (${unsafeEntries.slice(0, 3).join(", ")}${unsafeEntries.length > 3 ? ", ..." : ""}).`, { code: "ZIP_UNSAFE_ENTRIES" });
  }
}

/** Extracts a WordPress site's wp-content directory from a .zip archive (e.g. a hosting-panel export). */
export const ZipSource: ImportSource = {
  id: "zip",
  label: "Zip archive",

  async resolveOptions(options, ctx: ZipContext, { nonInteractive }) {
    ctx.zipFile = options.zip || (nonInteractive ? undefined : await askRequiredText("Path to the .zip archive:"));
    if (!ctx.zipFile) throw new MissingOptionError(["--zip <path>"]);
    ctx.sqlFile = options.sqlFile;
  },

  async fetchFiles(ctx: ZipContext, spinner?: any) {
    if (!ctx.zipFile) throw new CliError("Zip import requires --zip <path>.", { code: "USAGE" });
    if (!toolExists("unzip")) {
      throw new CliError("The `unzip` command is required for zip imports but was not found.", { code: "PREFLIGHT_FAILED", hint: "Install unzip and try again." });
    }
    const zipPath = path.resolve(ctx.zipFile.replace(/^~/, process.env.HOME || ""));
    if (!(await fs.pathExists(zipPath))) throw new CliError(`Zip file was not found: ${ctx.zipFile}`, { code: "ZIP_FILE_NOT_FOUND" });

    await assertSafeZipEntries(zipPath, ctx.zipFile);

    const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-zip-"));
    try {
      spinner?.message?.(`Extracting ${path.basename(zipPath)}...`);
      try {
        await runCommand("unzip", ["-q", "-o", zipPath, "-d", extractDir]);
      } catch (error) {
        throw new CliError(`Failed to extract ${ctx.zipFile}: ${describeError(error)}`, { code: "ZIP_EXTRACT_FAILED" });
      }
      await copyWordPressContent(extractDir, ctx.targetDir);
    } finally {
      await fs.remove(extractDir);
    }
  },

  async fetchDatabase(ctx: ZipContext, spinner?: any) {
    spinner?.message?.("Copying database dump...");
    return copySqlFile(ctx.sqlFile, ctx.targetDir);
  },
};
