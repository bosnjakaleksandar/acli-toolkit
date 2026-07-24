import chalk from "chalk";
import { confirm } from "@clack/prompts";
import { ask } from "../utils/prompts.ts";
import { runCommand } from "../utils/commandRunner.ts";
import { mascot } from "../ui/acaCharacter.ts";
import type { NextStepsResult } from "./NextStepsService.ts";

/**
 * Offers automatic dependency installation and removes completed commands from next steps.
 */
export async function maybeInstallDependencies(plan: NextStepsResult, spinner: any, ctx: any = {}): Promise<string> {
  let { nextSteps, hasNpm, hasComposer, installDir, packageManager } = plan;
  packageManager ??= { name: "npm", lockfile: "package-lock.json", install: ["install"], run: ["run"] };

  if (!hasNpm && !hasComposer) return nextSteps;
  if (ctx.nonInteractive) return nextSteps;

  const doInstall = await ask(confirm, {
    message: "Would you like me to install dependencies automatically?",
    initialValue: true,
  });

  if (!doInstall) return nextSteps;

  await mascot.show("working", "Installing dependencies...");
  mascot.stop();
  spinner.start("Installing dependencies...");
  try {
    if (hasComposer) {
      spinner.message("Running: composer install");
      await runCommand(
        "composer",
        ["install"],
        { cwd: installDir },
        (line: string) => spinner.message(`Composer: ${line}`),
      );
      nextSteps = nextSteps.replace(/  composer install\n?/g, "");
    }

    if (hasNpm) {
      spinner.message(`Running: ${packageManager.name} ${packageManager.install.join(" ")}`);
      await runCommand(
        packageManager.name,
        packageManager.install,
        { cwd: installDir },
        (line: string) => spinner.message(`NPM: ${line}`),
      );
      nextSteps = nextSteps.replace(new RegExp(`  ${packageManager.name} install.*?\\n?`, "g"), "");
    }

    spinner.stop("Dependencies installed successfully.");
    await mascot.show("success", "Dependencies installed successfully.");
    mascot.stop();
  } catch (err: any) {
    spinner.stop(chalk.yellow("Failed to install dependencies automatically. You may need to do it manually."));
    console.log(chalk.gray(`│  ${err.stderr?.trim() || err.message}`));
    console.log(chalk.gray("│  Suggested fix: run the listed install command manually from the generated directory."));
    await mascot.show("warning", "Install dependencies manually.");
    mascot.stop();
  }

  return nextSteps;
}
