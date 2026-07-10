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
import {
  mergeProjectContext,
  normalizeCliOptions,
} from "../services/CliOptionsService.js";
import { resolveStrategy } from "../services/StrategyResolver.js";
import { showBanner } from "../utils/banner.js";
import { BRANDING } from "../config/branding.js";
import { acaCharacter } from "../ui/acaCharacter.js";

/**
 * Runs the interactive project creation command.
 *
 * @param {object} options CLI options.
 */
export async function createProjectCommand(options = {}) {
  await showBanner();
  intro(chalk.bgCyan(chalk.black(` 🚀 ${BRANDING.name} CREATE `)));

  let targetDir = "";
  let s = null;

  try {
    const preset = await loadPreset(options.preset);
    const cliContext = normalizeCliOptions(options);
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const initialContext = mergeProjectContext(preset, cliContext);
    let ctx = await collectProjectContext(initialContext, { nonInteractive });
    const envService = resolveEnvironmentService(ctx.environment);
    const strategy = resolveStrategy(ctx, envService);

    ctx = await strategy.askQuestions(ctx, { nonInteractive });

    await acaCharacter.play("working", "Creating project structure...");
    acaCharacter.stop();
    s = spinner();
    s.start("Scaffolding your project...");

    targetDir = path.join(process.cwd(), ctx.projectName);
    await assertTargetDoesNotExist(targetDir, ctx.projectName, s);
    await fs.ensureDir(targetDir);
    await strategy.scaffold(targetDir, ctx, s);

    s.stop(`Project ${chalk.green(ctx.projectName)} successfully created!`);

    const installPlan = await buildNextSteps(targetDir, ctx);
    let nextSteps = await maybeInstallDependencies(installPlan, s, ctx);

    await maybeInitializeGit(targetDir, ctx);
    await maybeRegisterOnKnowledgeBase(ctx);

    await acaCharacter.play("success", "Project created successfully.");
    acaCharacter.stop();
    outro(`Next steps:\n${nextSteps}\n\n${chalk.cyan("Happy coding!")}`);
  } catch (error) {
    if (s) s.stop(chalk.red("A critical error occurred."));
    if (targetDir) await fs.remove(targetDir).catch(() => {});
    await acaCharacter.play("error", "Project creation failed.");
    acaCharacter.stop();
    printError(error);
    process.exit(1);
  }
}

export function registerCreateCommand(program) {
  program
    .command("create")
    .description("Scaffold a new application or WordPress project")
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--preset <preset>", "Use a built-in preset or path to a JSON preset file")
    .option("--existing", "Shortcut for setting up an existing WordPress project")
    .option("--type <type>", "Project type: application or wordpress")
    .option("--framework <framework>", "Application framework: react, nextjs, or next")
    .option("--laravel", "Add Laravel as a backend for application projects")
    .option("--wp-type <type>", "WordPress type: theme, woo, react, wp-theme, wp-woo, or wp-react")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--wp-version <version>", "WordPress version")
    .option("--theme-repo <url>", "Theme repository URL")
    .option("--theme-branch <branch>", "Theme repository branch")
    .option("--staging-url <url>", "Staging URL for existing WordPress search-replace")
    .option("--ssh-key <path>", "SSH private key path")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--skip-knowledge-base", "Skip Knowledge Base registration")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((options) => createProjectCommand(options));
}

async function assertTargetDoesNotExist(targetDir, projectName, s) {
  if (!(await fs.pathExists(targetDir))) return;

  s.stop("Directory exists!");
  await acaCharacter.play("warning", "Choose a different project name.");
  acaCharacter.stop();
  console.log(
    chalk.red(
      `Directory "${projectName}" already exists! Please choose a different name.`,
    ),
  );
  process.exit(1);
}

async function maybeRegisterOnKnowledgeBase(ctx) {
  if (ctx.skipKnowledgeBase) return;
  if (ctx.nonInteractive) return;

  await registerOnKnowledgeBase(ctx);
}

function printError(error) {
  console.log(chalk.redBright("\n--- Error Summary ---"));
  if (error.stderr || error.stdout) {
    console.log(chalk.red("Command failed:"));
    console.log(chalk.gray((error.stderr || error.stdout).trim() || error.message));
  } else if (error.message) {
    console.log(chalk.red(error.message));
  } else {
    console.error(error);
  }
  console.log(chalk.redBright("---------------------\n"));
}
