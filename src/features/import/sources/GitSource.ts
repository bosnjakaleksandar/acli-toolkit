import path from "node:path";
import fs from "fs-extra";
import os from "node:os";
import { runCommand } from "../../../utils/commandRunner.ts";
import { CliError, describeError } from "../../../core/errors.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../../../utils/safety.ts";
import type { ImportSource, ImportSourceContext } from "../ImportSource.ts";
import { copyWordPressContent, copySqlFile } from "./shared.ts";

interface GitContext extends ImportSourceContext {
  repositoryUrl?: string;
  branch?: string;
}

/** Clones a Git repository holding a WordPress site's wp-content directory. */
export const GitSource: ImportSource = {
  id: "git",
  label: "Git repository",

  async fetchFiles(ctx: GitContext, spinner?: any) {
    if (!ctx.repositoryUrl) throw new CliError("Git import requires --repo <url>.", { code: "USAGE" });
    // Rejects git's ext::/fd:: remote-helper schemes (documented git RCE
    // vectors — the "URL" is actually a shell command git will run), any
    // value starting with "-" (git would parse it as an option, not a URL),
    // and any URL embedding credentials.
    if (!isSafeGitUrl(ctx.repositoryUrl)) throw new CliError(`Unsafe or invalid git repository URL: ${redactUrlCredentials(ctx.repositoryUrl)}`, { code: "USAGE" });
    const cloneDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-git-"));
    try {
      spinner?.message?.(`Cloning ${redactUrlCredentials(ctx.repositoryUrl)}...`);
      const args = ["clone", "--depth", "1"];
      if (ctx.branch) args.push("--branch", ctx.branch);
      args.push(ctx.repositoryUrl, ".");
      try {
        await runCommand("git", args, { cwd: cloneDir }, spinner ? (line: string) => spinner.message(line) : null);
      } catch (error) {
        throw new CliError(`Failed to clone ${redactUrlCredentials(ctx.repositoryUrl)}: ${describeError(error)}`, { code: "GIT_CLONE_FAILED" });
      }
      await copyWordPressContent(cloneDir, ctx.targetDir);
    } finally {
      await fs.remove(cloneDir);
    }
  },

  async fetchDatabase(ctx: GitContext, spinner?: any) {
    spinner?.message?.("Copying database dump...");
    return copySqlFile(ctx.sqlFile, ctx.targetDir);
  },
};
