import { intro, outro, spinner } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { collectProjectContext } from "../prompts/projectPrompts.js";
import { maybeInstallDependencies } from "../services/DependencyInstallService.js";
import { resolveEnvironmentService } from "../services/EnvironmentResolver.js";
import { maybeInitializeGit } from "../services/GitService.js";
import { registerOnKnowledgeBase } from "../services/KnowledgeBaseService.js";
import { buildNextSteps } from "../services/NextStepsService.js";
import { loadPreset } from "../services/PresetService.js";
import { resolveStrategy } from "../services/StrategyResolver.js";
import { showBanner } from "../utils/banner.js";

/**
 * Runs the interactive project creation command.
 *
 * @param {{preset?: string}} options CLI options.
 */
export async function createProjectCommand(options = {}) {
  await showBanner();
  intro(chalk.bgCyan(chalk.black(" 🚀 CLI START ")));

  const preset = await loadPreset(options.preset);
  let ctx = await collectProjectContext(preset);
  const envService = resolveEnvironmentService(ctx.environment);
  const strategy = resolveStrategy(ctx, envService);

  ctx = await strategy.askQuestions(ctx);

  const s = spinner();
  s.start("Scaffolding your project...");

  const targetDir = path.join(process.cwd(), ctx.projectName);

  try {
    await assertTargetDoesNotExist(targetDir, ctx.projectName, s);
    await fs.ensureDir(targetDir);
    await strategy.scaffold(targetDir, ctx, s);

    s.stop(`Project ${chalk.green(ctx.projectName)} successfully created!`);

    const installPlan = await buildNextSteps(targetDir, ctx);
    let nextSteps = await maybeInstallDependencies(installPlan, s);

    await maybeInitializeGit(targetDir, ctx);
    await maybeRegisterOnKnowledgeBase(ctx);

    outro(`Next steps:\n${nextSteps}\n\n${chalk.cyan("Happy coding!")}`);
  } catch (error) {
    s.stop(chalk.red("A critical error occurred."));
    await fs.remove(targetDir).catch(() => {});
    printError(error);
    process.exit(1);
  }
}

async function assertTargetDoesNotExist(targetDir, projectName, s) {
  if (!(await fs.pathExists(targetDir))) return;

  s.stop("Directory exists!");
  console.log(
    chalk.red(
      `Directory "${projectName}" already exists! Please choose a different name.`,
    ),
  );
  process.exit(1);
}

async function maybeRegisterOnKnowledgeBase(ctx) {
  if (ctx.skipKnowledgeBase) return;

  await registerOnKnowledgeBase(ctx);
}

function printError(error) {
  console.log(chalk.redBright("\n--- Error Summary ---"));
  if (error.stderr || error.stdout) {
    console.log(chalk.red("Command failed:"));
    console.log(chalk.gray((error.stderr || error.stdout).trim() || error.message));
  } else {
    console.error(error);
  }
  console.log(chalk.redBright("---------------------\n"));
}
