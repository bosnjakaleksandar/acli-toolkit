import chalk from "chalk";
import { confirm } from "@clack/prompts";
import { ask } from "../utils/prompts.js";
import { runCommand } from "../utils/commandRunner.js";
import { acaCharacter } from "../ui/acaCharacter.js";

/**
 * Offers automatic dependency installation and removes completed commands from next steps.
 *
 * @param {{nextSteps: string, hasNpm: boolean, hasComposer: boolean, installDir: string}} plan Install plan.
 * @param {import("@clack/prompts").Spinner} spinner Clack spinner.
 * @param {object} ctx Project context.
 * @returns {Promise<string>} Updated next steps.
 */
export async function maybeInstallDependencies(plan, spinner, ctx = {}) {
  let { nextSteps, hasNpm, hasComposer, installDir } = plan;

  if (!hasNpm && !hasComposer) return nextSteps;
  if (ctx.nonInteractive) return nextSteps;

  const doInstall = await ask(confirm, {
    message: "Would you like me to install dependencies automatically?",
    initialValue: true,
  });

  if (!doInstall) return nextSteps;

  await acaCharacter.play("working", "Installing dependencies...");
  acaCharacter.stop();
  spinner.start("Installing dependencies...");
  try {
    if (hasComposer) {
      spinner.message("Running: composer install");
      await runCommand(
        "composer",
        ["install"],
        { cwd: installDir },
        (line) => spinner.message(`Composer: ${line}`),
      );
      nextSteps = nextSteps.replace(/  composer install\n?/g, "");
    }

    if (hasNpm) {
      spinner.message("Running: npm install");
      await runCommand(
        "npm",
        ["install"],
        { cwd: installDir },
        (line) => spinner.message(`NPM: ${line}`),
      );
      nextSteps = nextSteps.replace(/  npm install.*?\n?/g, "");
    }

    spinner.stop("Dependencies installed successfully.");
    await acaCharacter.play("success", "Dependencies installed successfully.");
    acaCharacter.stop();
  } catch (err) {
    spinner.stop(chalk.yellow("Failed to install dependencies automatically. You may need to do it manually."));
    console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
    console.log(chalk.gray("│  Suggested fix: run the listed install command manually from the generated directory."));
    await acaCharacter.play("warning", "Install dependencies manually.");
    acaCharacter.stop();
  }

  return nextSteps;
}
