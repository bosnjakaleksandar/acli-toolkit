import { confirm, note, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import path from "path";
import type { Command } from "commander";
import { collectProjectContext, editProjectContext } from "../../projects/prompts/projectPrompts.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { loadPreset } from "../../projects/plan/presets.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { deepMerge } from "../../config/merge.ts";
import { redactSecrets } from "../../config/redaction.ts";
import {
  mergeProjectContext,
  normalizeCliOptions,
  parseSetOverrides,
} from "../../projects/plan/PlanBuilder.ts";
import { resolveStrategy } from "../../projects/strategies/registry.ts";
import { mascot } from "../../ui/mascot.ts";
import { ask } from "../../ui/prompts.ts";
import { CliError, UsageError } from "../../core/errors.ts";
import { runCommand } from "../CommandShell.ts";
import { loadLastPlan, saveSuccessfulPlan } from "../../projects/plan/history.ts";
import { savePlanAsPreset } from "../../projects/plan/history.ts";
import { StepRunner, readStepState } from "../../core/StepRunner.ts";
import {
  buildProjectSummary,
  buildSuccessSummary,
  formatCreateError,
} from "../../ui/summaries.ts";
import { buildCreateSteps } from "../../projects/createPipeline.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";
import type { CreateCommandOptions } from "../options.ts";

/**
 * Runs the new-project scaffolding command. Existing WordPress projects are
 * intentionally handled only by `acli import`.
 */
export async function createProjectCommand(options: CreateCommandOptions = {}): Promise<void> {
  await runCommand({ title: "CREATE", icon: "🚀", failureMessage: "Project creation failed." }, async (shell) => {
    if (options.existing) {
      throw new UsageError("`acli create --existing` is no longer supported.", {
        hint: "Use `acli import` to import an existing WordPress project.",
      });
    }
    let targetDir = "";
    let s: ReturnType<typeof spinner> | null = null;
    let ownsTargetDir = false;
    let ctx: ProjectPlan | null = null;

    // Once the "scaffold" step has started, real files (and possibly an
    // imported database) may already exist on disk — deleting targetDir on
    // any later failure risked destroying recoverable work. Instead: never
    // delete once we own the directory, and point at `--resume` so the run
    // can continue from the failed step instead of starting over. Only a
    // failure before any artifact exists (preflight) has nothing to preserve.
    shell.onError((error) => {
      if (s) s.stop(chalk.red("A critical error occurred."));
      const resumeCommand = ownsTargetDir && ctx?.projectName ? `acli create --resume --name ${ctx.projectName}` : null;
      return formatCreateError(error, { targetDir, ownsTargetDir, resumeCommand });
    });

    const { config } = await loadConfig({ configPath: options.config });
    const preset = await loadPreset(options.preset, config);
    const cliContext = normalizeCliOptions(options);
    const setContext = parseSetOverrides(options.set);
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const previousPlan = options.fromLast ? await loadLastPlan() : {};
    if (options.fromLast && !previousPlan) throw new Error("No successful create history was found in this directory.");
    const mergedContext = mergeProjectContext(deepMerge(deepMerge(deepMerge(config.defaults || {}, previousPlan || {}), preset), setContext) as ProjectPlan, cliContext);
    if (mergedContext.setupType === "existing-wp") {
      throw new UsageError("This preset or saved plan describes an existing WordPress project.", {
        hint: "Use `acli import`; create only scaffolds new projects.",
      });
    }
    ctx = await collectProjectContext(withoutImportContext(mergedContext), { nonInteractive });
    const envService = resolveEnvironmentService(ctx.environment!);
    const strategy = resolveStrategy(ctx, envService);

    ctx = await strategy.askQuestions(ctx, { nonInteractive });
    targetDir = path.join(process.cwd(), ctx!.projectName!);

    if (options.dryRun) {
      const plan = strategy.buildPlan ? strategy.buildPlan(ctx) : {
        preset: ctx!.presetName || options.preset || null,
        project: ctx!.projectName,
        projectType: ctx!.projectType,
        ...(ctx!.appType === "wordpress" ? { localEnvironment: ctx!.environment } : {}),
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
        targetDir = path.join(process.cwd(), ctx!.projectName!);
        note(buildProjectSummary(ctx!, targetDir), "Project plan");
        decision = (await ask(select, { message: "What would you like to do?", options: [{ label: "Create project", value: "create" }, { label: "Change answers", value: "edit" }, { label: "Cancel", value: "cancel" }] })) as string;
        if (decision === "edit") ctx = await editProjectContext(ctx!);
      }
      if (decision === "cancel") {
        outro(chalk.yellow("Project creation cancelled. No files were changed."));
        return;
      }
    }

    await mascot.show("working", "Creating project structure...");
    mascot.stop();
    s = spinner();

    let nextSteps = "";
    const finalCtx = ctx!;
    const steps = buildCreateSteps({
      ctx: finalCtx,
      strategy,
      targetDir,
      spinner: s!,
      resume: Boolean(options.resume),
      onOwnsTargetDir: () => { ownsTargetDir = true; },
      onNextSteps: (result) => { nextSteps = result; },
    });
    const stepRunner = new StepRunner(steps, targetDir, {
      resumeCommand: `acli create --resume --name ${finalCtx.projectName}`,
      fingerprint: { command: "create", plan: redactSecrets(finalCtx) },
    });

    await stepRunner.run({ resume: Boolean(options.resume) });

    await mascot.show("success", "Project created successfully.");
    mascot.stop();
    await saveSuccessfulPlan(finalCtx);
    outro(buildSuccessSummary(targetDir, finalCtx as any, nextSteps));
    if (!nonInteractive && await ask(confirm, { message: "Save this plan as a reusable preset?", initialValue: false })) {
      const presetName = await ask(text, { message: "Preset name:", validate: (value: string | undefined) => value && /^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : "Use lowercase letters, numbers, and hyphens." });
      const presetFile = await savePlanAsPreset(presetName, finalCtx, { configPath: options.config });
      console.log(chalk.gray(`Preset "${presetName}" saved to ${presetFile}.`));
    }
  });
}

export function registerCreateCommand(program: Command): void {
  program
    .command("create")
    .description("Scaffold a new application or WordPress project")
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--preset <preset>", "Use a named preset or portable YAML preset file")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--set <key=value>", "Override a non-secret configuration value", collect, [] as string[])
    .option("--dry-run", "Validate and print the execution plan without mutation")
    .option("--from-last", "Reuse the last successful create plan from this directory")
    .option("--resume", "Continue an interrupted create run instead of starting over")
    .option("--existing", "Unsupported compatibility flag; use `acli import`")
    .option("--type <type>", "Project type: application or wordpress")
    .option("--framework <framework>", "Application framework: react, nextjs, or next")
    .option("--laravel", "Add Laravel as a backend for application projects")
    .option("--wp-type <type>", "WordPress type: theme, woo, react, wp-theme, wp-woo, or wp-react")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--wp-version <version>", "WordPress version")
    .option("--theme-repo <url>", "Theme repository URL")
    .option("--theme-branch <branch>", "Theme repository branch")
    .option("--ssh-key <path>", "SSH private key path")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((options: CreateCommandOptions) => createProjectCommand(options));
}

function collect(value: string, previous: string[]): string[] { return [...previous, value]; }

/** Import-only defaults must never affect a fresh scaffold. */
function withoutImportContext(ctx: ProjectPlan): ProjectPlan {
  const clean: ProjectPlan = { ...ctx, setupType: "new" };
  for (const key of ["profile", "stagingUrl", "skipFiles", "skipDatabase", "skipGitLink", "keepDump"]) delete clean[key];
  return clean;
}
