import chalk from "chalk";
import { runCommand } from "../utils/commandRunner.ts";
import { ask } from "../utils/prompts.ts";
import { confirm } from "@clack/prompts";

/**
 * Optionally initializes a Git repository for a generated project.
 */
export async function maybeInitializeGit(targetDir: string, ctx: { skipGitInit?: boolean; nonInteractive?: boolean }): Promise<void> {
  if (ctx.skipGitInit) return;

  if (ctx.nonInteractive) {
    try {
      await runCommand("git", ["init"], { cwd: targetDir });
      console.log(chalk.gray("│  Initialized empty Git repository."));
    } catch (err: any) {
      console.log(chalk.red("│  Failed to initialize git."));
      console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
      console.log(chalk.gray("│  Suggested fix: install Git or check write permissions in the project directory."));
    }
    return;
  }

  const doGitInit = await ask(confirm, {
    message: "Do you want to initialize a new Git repository?",
    initialValue: true,
  });

  if (!doGitInit) return;

  try {
    await runCommand("git", ["init"], { cwd: targetDir });
    console.log(chalk.gray("│  Initialized empty Git repository."));
  } catch (err: any) {
    console.log(chalk.red("│  Failed to initialize git."));
    console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
    console.log(chalk.gray("│  Suggested fix: install Git or check write permissions in the project directory."));
  }
}
