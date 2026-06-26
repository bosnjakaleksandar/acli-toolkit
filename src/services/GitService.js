import chalk from "chalk";
import { runCommand } from "../utils/commandRunner.js";
import { ask } from "../utils/prompts.js";
import { confirm } from "@clack/prompts";

/**
 * Optionally initializes a Git repository for a generated project.
 *
 * @param {string} targetDir Project directory.
 * @param {object} ctx Project context.
 */
export async function maybeInitializeGit(targetDir, ctx) {
  if (ctx.skipGitInit) return;

  const doGitInit = await ask(confirm, {
    message: "Do you want to initialize a new Git repository?",
    initialValue: true,
  });

  if (!doGitInit) return;

  try {
    await runCommand("git", ["init"], { cwd: targetDir });
    console.log(chalk.gray("│  Initialized empty Git repository."));
  } catch (err) {
    console.log(chalk.red("│  Failed to initialize git."));
    console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
    console.log(chalk.gray("│  Suggested fix: install Git or check write permissions in the project directory."));
  }
}
