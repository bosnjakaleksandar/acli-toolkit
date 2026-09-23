import { note, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import type { Command } from "commander";
import { mascot } from "../../ui/mascot.ts";
import { ask } from "../../ui/prompts.ts";
import { CliError, MissingOptionError, TargetExistsError } from "../../core/errors.ts";
import { runCommand } from "../CommandShell.ts";
import { readStepState } from "../../core/StepRunner.ts";
import { ProfileImportSource } from "../../wordpress/import/sources/RemoteSource.ts";
import { runImportWorkflow } from "../../wordpress/import/ImportWorkflow.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { maybeInstallDependencies } from "../../system/dependencies.ts";
import { maybeInitializeGit } from "../../system/git.ts";
import { buildNextSteps } from "../../projects/nextSteps.ts";
import { runLocalPreflight } from "../../system/preflight.ts";
import { toProjectName, validateProjectName } from "../../projects/plan/projectName.ts";
import { buildSuccessSummary, formatCreateError } from "../../ui/summaries.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { resolveProfileSelection, profileSummary } from "../../profiles/ProfileSelection.ts";
import { resolveRemoteProfile } from "../../providers/resolveProfile.ts";
import { createRemoteBackend, type RemoteBackend } from "../../providers/registry.ts";
import { shellQuote } from "../../providers/sshArgs.ts";
import { REMOTE_PROJECT_PATTERN } from "../../core/objects.ts";
import type { ImportCommandOptions } from "../options.ts";
import { DEFAULT_WORDPRESS_VERSION } from "../../config/defaults.ts";

/**
 * `acli import`: brings an existing WordPress site into a new local project
 * through a configured staging profile.
 *
 * Profile availability is checked before any project questions: no profile
 * is an error, --profile or the default profile wins, a sole profile is
 * selected automatically, and otherwise the user picks one. A profile
 * describes a server; which project on it to import is the `[project]`
 * argument, or — when the server can list its projects — picked from that
 * list.
 */
export async function importCommand(options: ImportCommandOptions = {}): Promise<void> {
  await runCommand({ title: "IMPORT", icon: "📥", failureMessage: "Import failed." }, async (shell) => {
    let targetDir = "";
    let ownsTargetDir = false;
    let ctx: any = null;
    let s: ReturnType<typeof spinner> | null = null;
    let resumeCommand: string | null = null;
    const nonInteractive = Boolean(options.yes || options.nonInteractive);

    shell.onError((error) => {
      if (s) s.stop(chalk.red("A critical error occurred."));
      return formatCreateError(error, { targetDir, ownsTargetDir, resumeCommand: ownsTargetDir ? resumeCommand : null, action: "Import" });
    });

    const { config } = await loadConfig({ configPath: options.config });
    const selection = await resolveProfileSelection({
      config,
      options,
      attachedProfileName: undefined,
      required: true,
      nonInteractive,
      offerCreateWhenMissing: false,
      configuredOnly: true,
    });
    const source = ProfileImportSource;

    if (options.project !== undefined && !REMOTE_PROJECT_PATTERN.test(options.project)) {
      throw new CliError(`"${options.project}" is not a valid server project name.`, { code: "USAGE", hint: "Use the name exactly as the server lists it (letters, digits, spaces, . _ -)." });
    }
    let remoteProject = options.project;
    if (!remoteProject && !options.resume && !nonInteractive) remoteProject = await pickServerProject(selection.profile!);

    const name = options.name || (nonInteractive ? (remoteProject ? toProjectName(remoteProject) : undefined) : await ask(text, {
      message: "Local project directory/name:",
      initialValue: remoteProject ? toProjectName(remoteProject) : "project-name",
      validate: validateProjectName,
    }));
    if (!name) throw new MissingOptionError(["--name <directory>"]);
    const nameError = validateProjectName(name);
    if (nameError) throw new CliError(nameError, { code: "USAGE" });

    let environment = options.environment || options.env;
    if (!environment) {
      environment = nonInteractive ? "docker" : (await ask(select, {
        message: "Which local environment do you prefer?",
        options: [{ label: "Docker (docker-compose.yaml)", value: "docker" }, { label: "Lando (.lando.yml)", value: "lando" }],
      })) as string;
    }
    if (!["docker", "lando"].includes(environment)) {
      throw new CliError(`--environment must be "docker" or "lando" (got "${environment}").`, { code: "USAGE" });
    }

    ctx = {
      projectName: name,
      environment,
      appType: "wordpress",
      setupType: "existing-wp",
      projectType: "wp-existing",
      mysqlVersion: options.mysql || "8.0",
      // A generated docker-compose.yaml always templates {{WP_VERSION}} into
      // its wordpress image tag (see DockerEnvironment.scaffold) — every
      // import source needs a value here or that placeholder is left
      // unsubstituted in the generated file.
      wpVersion: options.wpVersion || config.defaults?.wpVersion || DEFAULT_WORDPRESS_VERSION,
      skipFiles: Boolean(options.skipFiles),
      skipDatabase: Boolean(options.skipDatabase),
      skipGitLink: Boolean(options.skipGitLink),
      skipGitInit: Boolean(options.skipGit),
      stagingUrl: options.remoteUrl,
      keepDump: Boolean(options.keepDump),
      nonInteractive,
      remoteProject,
      selections: {},
    };

    ctx.profile = resolveRemoteProfile(selection.profile!, { projectName: ctx.projectName, remoteProject });
    ctx.stagingUrl = ctx.stagingUrl || ctx.profile.urls?.staging || undefined;
    if (!nonInteractive) {
      const serverProject = remoteProject && remoteProject !== ctx.projectName ? `\nServer project: ${remoteProject}` : "";
      note(profileSummary(selection.profile!, ctx.environment, ctx.projectName) + serverProject, `Selected profile: ${selection.profileName}`);
    }

    targetDir = path.join(process.cwd(), ctx.projectName);
    ctx.targetDir = targetDir;
    resumeCommand = importResumeCommand(ctx.projectName, remoteProject);

    if (options.dryRun) {
      const envServiceForPlan = resolveEnvironmentService(ctx.environment);
      const plan = source.buildPlan
        ? { ...(source.buildPlan(ctx) as Record<string, unknown>), localUrl: envServiceForPlan.getLocalUrl(ctx) }
        : { profile: selection.profileName, project: ctx.projectName, localEnvironment: ctx.environment };
      note(JSON.stringify(plan, null, 2), "Import plan");
      outro(chalk.green("Dry run complete. No project files or remote state were changed."));
      return;
    }

    if (options.resume && !(await readStepState(targetDir))) {
      throw new CliError(`Nothing to resume at "${targetDir}": no in-progress import run was found there.`, {
        code: "NOTHING_TO_RESUME",
        hint: "Check --name matches the interrupted run's project name. If a prior run failed before its first step recorded any progress, the directory may just be empty — remove it, then start a fresh run without --resume.",
      });
    }

    await mascot.show("working", "Importing WordPress site...");
    mascot.stop();
    s = spinner();
    s.start("1/3 Validating project and requirements...");

    if (!options.resume) {
      if (await fs.pathExists(targetDir)) throw new TargetExistsError(targetDir);
    }
    const preflight = await runLocalPreflight(ctx);
    ctx.warnings = preflight.warnings;

    const envService = resolveEnvironmentService(ctx.environment);
    s.message("2/3 Importing files and database...");
    await fs.ensureDir(targetDir);
    ownsTargetDir = true;

    await runImportWorkflow({ source, ctx, targetDir, envService, spinner: s, resume: Boolean(options.resume), resumeCommand });
    s.stop("2/3 Import complete.");

    const installPlan = await buildNextSteps(targetDir, ctx);
    s.start("3/3 Finalizing...");
    let nextSteps = await maybeInstallDependencies(installPlan, s, ctx);
    ctx.dependenciesInstalled = !nextSteps.includes(" install");
    await maybeInitializeGit(targetDir, ctx);
    s.stop("3/3 Done.");

    await mascot.show("success", "Import completed successfully.");
    mascot.stop();
    outro(buildSuccessSummary(targetDir, ctx, nextSteps));
  });
}


/** The exact command that continues this import, including the server project when it differs from the local name. */
export function importResumeCommand(projectName: string, remoteProject?: string): string {
  return `acli import ${remoteProject && remoteProject !== projectName ? `${shellQuote(remoteProject)} ` : ""}--resume --name ${projectName}`;
}

/**
 * Asks which server project to import, when the profile's server can list
 * them. Resolved against a placeholder project name — listing doesn't
 * depend on which project is chosen.
 */
export async function pickServerProject(
  profile: Parameters<typeof resolveRemoteProfile>[0],
  {
    createBackend = createRemoteBackend,
    choose = async (projects: string[]) => (await ask(select, { message: "Which project do you want to import?", options: projects.map((project) => ({ label: project, value: project })) })) as string,
  }: { createBackend?: (profile: ReturnType<typeof resolveRemoteProfile>) => RemoteBackend; choose?: (projects: string[]) => Promise<string> } = {},
): Promise<string | undefined> {
  const backend = createBackend(resolveRemoteProfile(profile, { projectName: "project-list" }));
  if (!backend.listProjects) return undefined;
  const projects = await backend.listProjects();
  if (!projects.length) throw new CliError("No projects on this server are assigned to you.", { code: "NO_REMOTE_PROJECTS", hint: "Ask the server administrator to grant you access to a project." });
  return choose(projects);
}

export function registerImportCommand(program: Command): void {
  program
    .command("import [project]")
    .description("Import an existing WordPress site through a configured staging profile. [project] is its name on the server; omit it to pick from the server's list")
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--wp-version <version>", "WordPress version")
    .option("--dry-run", "Validate and print the execution plan without mutation")
    .option("--resume", "Continue an interrupted import run instead of starting over")
    .option("--profile <profile>", "Use a configured staging profile")
    .option("--remote-url <url>", "The site's real/original URL, used as an extra search-replace source")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--skip-files", "Skip the file transfer step")
    .option("--skip-database", "Skip the database import step")
    .option("--skip-git-link", "Skip remote Git discovery and linking")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--keep-dump", "Keep staging.sql after a successful migration")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((project: string | undefined, options: ImportCommandOptions) => importCommand({ ...options, ...(project !== undefined ? { project } : {}) }));
}
