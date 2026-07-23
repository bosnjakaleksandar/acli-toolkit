import { confirm, intro, note, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { collectProjectContext, editProjectContext } from "../prompts/projectPrompts.js";
import { maybeInstallDependencies } from "../services/DependencyInstallService.js";
import { resolveEnvironmentService } from "../services/EnvironmentResolver.ts";
import { maybeInitializeGit } from "../services/GitService.js";
import { buildNextSteps } from "../services/NextStepsService.ts";
import { loadPreset } from "../services/PresetService.ts";
import { deepMerge, loadConfig, redactSecrets } from "../services/ConfigService.ts";
import {
  mergeProjectContext,
  normalizeCliOptions,
  parseSetOverrides,
} from "../services/CliOptionsService.js";
import { resolveStrategy } from "../services/StrategyResolver.ts";
import { BRANDING } from "../config/branding.ts";
import { mascot } from "../ui/acaCharacter.js";
import { ask } from "../utils/prompts.js";
import { resolveProfileSelection, profileSummary } from "../services/ProfileSelectionService.ts";
import { CliError, TargetExistsError } from "../core/errors.ts";
import { loadLastPlan, saveSuccessfulPlan } from "../services/HistoryService.js";
import { savePlanAsPreset } from "../services/HistoryService.js";
import { runLocalPreflight } from "../services/PreflightService.js";
import { StepRunner, readStepState } from "../core/StepRunner.ts";
import {
  buildProjectSummary,
  buildSuccessSummary,
  formatCreateError,
} from "../services/CreateProjectUxService.js";

/**
 * Runs the interactive project creation command.
 *
 * @param {object} options CLI options.
 */
export async function createProjectCommand(options = {}) {
  if (options.existing && !options._viaImportCommand) {
    console.warn(chalk.yellow("Warning: 'create --existing' is deprecated. Use 'acli import' instead.\n"));
  }
  intro(chalk.bgCyan(chalk.black(` 🚀 ${BRANDING.name} CREATE `)));

  let targetDir = "";
  let s = null;
  let ownsTargetDir = false;
  let ctx = null;

  try {
    let { config } = await loadConfig({ configPath: options.config });
    const preset = await loadPreset(options.preset, config);
    const cliContext = normalizeCliOptions(options);
    const setContext = parseSetOverrides(options.set);
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const previousPlan = options.fromLast ? await loadLastPlan() : {};
    if (options.fromLast && !previousPlan) throw new Error("No successful create history was found in this directory.");
    const initialContext = mergeProjectContext(deepMerge(deepMerge(deepMerge(config.defaults || {}, previousPlan || {}), preset), setContext), cliContext);
    ctx = await collectProjectContext(initialContext, { nonInteractive });
    const needsProfile = ctx.setupType === "existing-wp";
    const selection = await resolveProfileSelection({ config, options, attachedProfileName: ctx.profile, required: needsProfile, nonInteractive });
    config = selection.config;
    if (selection.profile) {
      ctx.profile = selection.profile;
      if (!nonInteractive) note(profileSummary(selection.profile, ctx.environment), `Selected profile: ${selection.profileName}`);
    }
    const envService = resolveEnvironmentService(ctx.environment);
    const strategy = resolveStrategy(ctx, envService);

    ctx = await strategy.askQuestions(ctx, { nonInteractive });
    targetDir = path.join(process.cwd(), ctx.projectName);

    if (options.dryRun) {
      const plan = typeof strategy.buildPlan === "function" ? strategy.buildPlan(ctx) : {
        preset: ctx.presetName || options.preset || null,
        project: ctx.projectName,
        projectType: ctx.projectType,
        localEnvironment: ctx.environment,
      };
      console.log(JSON.stringify(redactSecrets(plan), null, 2));
      outro(chalk.green("Dry run complete. No project files or remote state were changed."));
      return;
    }

    if (options.resume && !(await readStepState(targetDir))) {
      throw new CliError(`Nothing to resume at "${targetDir}": no in-progress create run was found there.`, {
        code: "NOTHING_TO_RESUME",
        hint: "Check --name matches the interrupted run's project name. If a prior run failed before its first step recorded any progress, the directory may just be empty — remove it, then start a fresh run without --resume.",
      });
    }

    if (!nonInteractive && !options.resume) {
      let decision = "edit";
      while (decision === "edit") {
        targetDir = path.join(process.cwd(), ctx.projectName);
        note(buildProjectSummary(ctx, targetDir), "Project plan");
        decision = await ask(select, { message: "What would you like to do?", options: [{ label: "Create project", value: "create" }, { label: "Change answers", value: "edit" }, { label: "Cancel", value: "cancel" }] });
        if (decision === "edit") ctx = await editProjectContext(ctx);
      }
      if (decision === "cancel") {
        outro(chalk.yellow("Project creation cancelled. No files were changed."));
        return;
      }
    }

    await mascot.show("working", "Creating project structure...");
    mascot.stop();
    s = spinner();

    const totalSteps = 4;
    let nextSteps = "";
    const stepRunner = new StepRunner(
      [
        {
          id: "preflight",
          title: "Validating project and requirements",
          run: async () => {
            s.start(`1/${totalSteps} Validating project and requirements...`);
            if (!options.resume) await assertTargetDoesNotExist(targetDir);
            const preflight = await runLocalPreflight(ctx);
            ctx.warnings = [...(ctx.warnings || []), ...preflight.warnings];
            if (typeof strategy.preflight === "function") await strategy.preflight(ctx, s);
          },
        },
        {
          id: "scaffold",
          title: "Creating project files",
          run: async () => {
            s.message(`2/${totalSteps} Creating project files...`);
            await fs.ensureDir(targetDir);
            ownsTargetDir = true;
            await strategy.scaffold(targetDir, ctx, s);
            s.stop(`2/${totalSteps} Project files created.`);
          },
        },
        {
          id: "dependencies",
          title: "Preparing dependencies",
          run: async () => {
            const installPlan = await buildNextSteps(targetDir, ctx);
            s.start(`3/${totalSteps} Preparing dependencies...`);
            s.stop(`3/${totalSteps} Dependency plan ready.`);
            nextSteps = await maybeInstallDependencies(installPlan, s, ctx);
            ctx.dependenciesInstalled = !nextSteps.includes(" install");
          },
        },
        {
          id: "git",
          title: "Initializing Git repository",
          run: async () => {
            s.start(`4/${totalSteps} Initializing Git repository...`);
            await maybeInitializeGit(targetDir, ctx);
            s.stop(ctx.skipGitInit ? `4/${totalSteps} Git initialization skipped.` : `4/${totalSteps} Git repository initialized.`);
          },
        },
      ],
      targetDir,
    );

    await stepRunner.run({ resume: Boolean(options.resume) });

    await mascot.show("success", "Project created successfully.");
    mascot.stop();
    await saveSuccessfulPlan(ctx);
    outro(buildSuccessSummary(targetDir, ctx, nextSteps));
    if (!nonInteractive && await ask(confirm, { message: "Save this plan as a reusable preset?", initialValue: false })) {
      const presetName = await ask(text, { message: "Preset name:", validate: (value) => /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : "Use lowercase letters, numbers, and hyphens." });
      const presetFile = await savePlanAsPreset(presetName, ctx, { configPath: options.config });
      console.log(chalk.gray(`Preset "${presetName}" saved to ${presetFile}.`));
    }
  } catch (error) {
    if (s) s.stop(chalk.red("A critical error occurred."));
    // Once the "scaffold" step has started, real files (and possibly an
    // imported database) may already exist on disk — deleting targetDir on
    // any later failure risked destroying recoverable work. Instead: never
    // delete once we own the directory, and point at `--resume` so the run
    // can continue from the failed step instead of starting over. Only a
    // failure before any artifact exists (preflight) has nothing to preserve.
    const resumeCommand = ownsTargetDir && ctx?.projectName ? `acli create --resume --name ${ctx.projectName}` : null;
    await mascot.show("error", "Project creation failed.");
    mascot.stop();
    console.log(formatCreateError(error, { targetDir, ownsTargetDir, resumeCommand }));
    if (process.env.ACLI_DEBUG === "1" && error?.stack) console.error(error.stack);
    process.exitCode = error.exitCode || 1;
  }
}

export function registerCreateCommand(program) {
  program
    .command("create")
    .description("Scaffold a new application or WordPress project")
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--preset <preset>", "Use a named preset or portable YAML preset file")
    .option("--profile <profile>", "Use a named or portable remote environment profile")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--set <key=value>", "Override a non-secret configuration value", collect, [])
    .option("--dry-run", "Validate and print the execution plan without mutation")
    .option("--from-last", "Reuse the last successful create plan from this directory")
    .option("--resume", "Continue an interrupted create run instead of starting over")
    .option("--existing", "Shortcut for setting up an existing WordPress project")
    .option("--type <type>", "Project type: application or wordpress")
    .option("--framework <framework>", "Application framework: react, nextjs, or next")
    .option("--laravel", "Add Laravel as a backend for application projects")
    .option("--wp-type <type>", "WordPress type: theme, woo, react, wp-theme, wp-woo, or wp-react")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--wp-version <version>", "WordPress version")
    .option("--theme-repo <url>", "Theme repository URL")
    .option("--theme-branch <branch>", "Theme repository branch")
    .option("--staging-url <url>", "Optional extra search-replace source; the imported site's actual URL is detected automatically")
    .option("--ssh-key <path>", "SSH private key path")
    .option("--keep-dump", "Keep staging.sql after a successful migration")
    .option("--skip-files", "Skip remote WordPress file transfer")
    .option("--skip-database", "Skip remote database export and local import")
    .option("--skip-git-link", "Skip remote Git discovery and linking")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((options) => createProjectCommand(options));
}

function collect(value, previous) { return [...previous, value]; }

async function assertTargetDoesNotExist(targetDir) {
  if (!(await fs.pathExists(targetDir))) return;
  throw new TargetExistsError(targetDir);
}
