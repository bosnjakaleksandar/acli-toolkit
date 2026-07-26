import path from "node:path";
import fs from "fs-extra";
import { CliError, MissingOptionError } from "../../../core/errors.ts";
import { askRequiredText } from "../../../ui/prompts.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import { copyWordPressContent, copySqlFile } from "./fileCopy.ts";

interface LocalFolderContext extends ImportSourceContext {
  localPath?: string;
}

/** Copies an existing WordPress installation already present on this machine (e.g. a downloaded backup). */
export const LocalFolderSource: ImportSource = {
  id: "local",
  label: "Local folder already on this machine",

  async resolveOptions(options, ctx: LocalFolderContext, { nonInteractive }) {
    ctx.localPath = options.localPath || (nonInteractive ? undefined : await askRequiredText("Path to the existing WordPress installation:"));
    if (!ctx.localPath) throw new MissingOptionError(["--local-path <path>"]);
    ctx.sqlFile = options.sqlFile;
  },

  async fetchFiles(ctx: LocalFolderContext, spinner?: any) {
    if (!ctx.localPath) throw new CliError("Local folder import requires --local-path <path>.", { code: "USAGE" });
    const sourcePath = path.resolve(ctx.localPath.replace(/^~/, process.env.HOME || ""));
    if (!(await fs.pathExists(sourcePath))) {
      throw new CliError(`Local WordPress path was not found: ${ctx.localPath}`, { code: "LOCAL_PATH_NOT_FOUND" });
    }
    spinner?.message?.("Copying WordPress files from local folder...");
    await copyWordPressContent(sourcePath, ctx.targetDir);
  },

  async fetchDatabase(ctx: LocalFolderContext, spinner?: any) {
    spinner?.message?.("Copying database dump...");
    return copySqlFile(ctx.sqlFile, ctx.targetDir);
  },
};
