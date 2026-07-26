import { CliError, MissingOptionError } from "../../../core/errors.ts";
import { askRequiredText } from "../../../ui/prompts.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import { copySqlFile } from "./fileCopy.ts";

/** Imports only a database dump, with no file sync at all — useful when the theme/plugins already live in the target project (e.g. paired with `--skip-files` in a preset), or files simply aren't needed. */
export const SqlManualSource: ImportSource = {
  id: "sql",
  label: "Database dump only (no file sync)",

  async resolveOptions(options, ctx, { nonInteractive }) {
    ctx.sqlFile = options.sqlFile || (nonInteractive ? undefined : await askRequiredText("Path to the .sql database dump:"));
    if (!ctx.sqlFile) throw new MissingOptionError(["--sql-file <path>"]);
  },

  async fetchFiles() {
    // Intentionally a no-op: this source only supplies a database dump.
  },

  async fetchDatabase(ctx: ImportSourceContext, spinner?: any) {
    if (!ctx.sqlFile) throw new CliError("The sql import source requires --sql-file <path>.", { code: "USAGE" });
    spinner?.message?.("Copying database dump...");
    return copySqlFile(ctx.sqlFile, ctx.targetDir);
  },
};
