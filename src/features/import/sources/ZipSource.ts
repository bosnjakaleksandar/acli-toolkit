import path from "node:path";
import fs from "fs-extra";
import os from "node:os";
import { runCommand } from "../../../utils/commandRunner.ts";
import { toolExists } from "../../../services/ToolCheckService.ts";
import { CliError, describeError } from "../../../core/errors.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import { copyWordPressContent, copySqlFile } from "./shared.ts";

interface ZipContext extends ImportSourceContext {
  zipFile?: string;
}

/** Extracts a WordPress site's wp-content directory from a .zip archive (e.g. a hosting-panel export). */
export const ZipSource: ImportSource = {
  id: "zip",
  label: "Zip archive",

  async fetchFiles(ctx: ZipContext, spinner?: any) {
    if (!ctx.zipFile) throw new CliError("Zip import requires --zip <path>.", { code: "USAGE" });
    if (!toolExists("unzip")) {
      throw new CliError("The `unzip` command is required for zip imports but was not found.", { code: "PREFLIGHT_FAILED", hint: "Install unzip and try again." });
    }
    const zipPath = path.resolve(ctx.zipFile.replace(/^~/, process.env.HOME || ""));
    if (!(await fs.pathExists(zipPath))) throw new CliError(`Zip file was not found: ${ctx.zipFile}`, { code: "ZIP_FILE_NOT_FOUND" });

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
