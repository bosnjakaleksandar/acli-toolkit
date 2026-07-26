import { note, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import type { Command } from "commander";
import { mascot } from "../../ui/mascot.ts";
import { ask, askRequiredText } from "../../ui/prompts.ts";
import { CliError, MissingOptionError, TargetExistsError } from "../../core/errors.ts";
import { runCommand } from "../CommandShell.ts";
import { readStepState } from "../../core/StepRunner.ts";
import { ImportSourceRegistry } from "../../wordpress/import/ImportSource.ts";
import { LocalFolderSource } from "../../wordpress/import/sources/LocalFolderSource.ts";
import { GitSource } from "../../wordpress/import/sources/GitSource.ts";
import { SqlManualSource } from "../../wordpress/import/sources/SqlManualSource.ts";
import { ZipSource } from "../../wordpress/import/sources/ZipSource.ts";
import { createProfileImportSource, type ProfileImportContext } from "../../wordpress/import/sources/RemoteSource.ts";
import { runImportWorkflow } from "../../wordpress/import/ImportWorkflow.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { maybeInstallDependencies } from "../../system/dependencies.ts";
import { maybeInitializeGit } from "../../system/git.ts";
import { buildNextSteps } from "../../projects/nextSteps.ts";
import { runLocalPreflight } from "../../system/preflight.ts";
import { validateProjectName } from "../../projects/plan/projectName.ts";
import { buildSuccessSummary, formatCreateError } from "../../ui/summaries.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { validateProfileConfig } from "../../config/schema.ts";
import { resolveProfileSelection, profileSummary } from "../../profiles/ProfileSelection.ts";
import { resolveRemoteProfile } from "../../remote/resolveProfile.ts";
import type { ImportCommandOptions } from "../options.ts";
import type { Profile } from "../../core/model/Profile.ts";

const importSourceRegistry = new ImportSourceRegistry();
importSourceRegistry.register(LocalFolderSource);
importSourceRegistry.register(GitSource);
importSourceRegistry.register(SqlManualSource);
importSourceRegistry.register(ZipSource);
// "profile" (a saved staging profile) and "ssh" (a one-off target with no
// saved profile) both describe *remote* WordPress hosts. They share one
// ImportSource implementation (RemoteHost-backed) — the only
// difference is how ctx.profile gets resolved before the workflow starts,
// handled below in resolveProfileForImport().
importSourceRegistry.register(createProfileImportSource("profile", "Staging profile"));
importSourceRegistry.register(createProfileImportSource("ssh", "One-off SSH target"));

/**
 * `acli import`: brings an existing WordPress site into a new local
 * project. Every --source (profile, ssh, local, git, sql, zip) runs through
 * the same ImportWorkflow/StepRunner pipeline — profile/ssh differ only in
 * how ctx.profile is resolved before that pipeline starts.
 *
 * Every required field (source, name, environment, and whichever fields the
 * chosen source itself requires) falls back to an interactive prompt when
 * unset and the run isn't --yes/--non-interactive — this is what lets
 * `acli import` work with zero flags from a terminal, and what the
 * top-level `acli` menu's "Import" choice relies on (it calls this with no
 * pre-supplied options at all). Non-interactive callers (scripts, --yes)
 * get a clear MissingOptionError/CliError instead of hanging on a prompt.
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

    const sourceId = options.source || (nonInteractive ? "profile" : await ask(select, {
      message: "Where is the WordPress site coming from?",
      options: importSourceRegistry.list().map((candidate) => ({ label: candidate.label, value: candidate.id })),
    }) as string);
    const source = importSourceRegistry.get(sourceId);

    const name = options.name || (nonInteractive ? undefined : await ask(text, {
      message: "Project directory/name:",
      initialValue: "project-name",
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
      // its wordpress image tag (see DockerComposeService.scaffold) — every
      // import source needs a value here or that placeholder is left
      // unsubstituted in the generated file.
      wpVersion: "latest",
      branch: options.branch,
      skipFiles: Boolean(options.skipFiles),
      skipDatabase: Boolean(options.skipDatabase),
      skipGitLink: Boolean(options.skipGitLink),
      skipGitInit: Boolean(options.skipGit),
      stagingUrl: options.remoteUrl,
      keepDump: Boolean(options.keepDump),
      nonInteractive,
    };

    await resolveSourceOptions(sourceId, options, ctx, nonInteractive);

    targetDir = path.join(process.cwd(), ctx.projectName);
    ctx.targetDir = targetDir;
    resumeCommand = `acli import --source ${sourceId} --resume --name ${ctx.projectName}`;

    if (options.dryRun) {
      const envServiceForPlan = resolveEnvironmentService(ctx.environment);
      const plan = source.buildPlan
        ? { ...(source.buildPlan(ctx) as Record<string, unknown>), localUrl: envServiceForPlan.getLocalUrl(ctx) }
        : { source: sourceId, project: ctx.projectName, localEnvironment: ctx.environment };
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

/**
 * Resolves and, when interactive, prompts for whichever fields the chosen
 * source requires and weren't already supplied — mutates `ctx` in place.
 * profile/ssh need a resolved remote profile (see resolveProfileForImport);
 * local/git/zip/sql each need exactly one path/URL of their own.
 */
async function resolveSourceOptions(sourceId: string, options: ImportCommandOptions, ctx: any, nonInteractive: boolean): Promise<void> {
  if (sourceId === "profile" || sourceId === "ssh") {
    ctx.profile = await resolveProfileForImport(sourceId, options, ctx, nonInteractive);
    return;
  }
  if (sourceId === "local") {
    ctx.localPath = options.localPath || (nonInteractive ? undefined : await askRequiredText("Path to the existing WordPress installation:"));
    if (!ctx.localPath) throw new MissingOptionError(["--local-path <path>"]);
    ctx.sqlFile = options.sqlFile;
    return;
  }
  if (sourceId === "git") {
    ctx.repositoryUrl = options.repo || (nonInteractive ? undefined : await askRequiredText("Git repository URL (HTTPS or SSH) containing wp-content:"));
    if (!ctx.repositoryUrl) throw new MissingOptionError(["--repo <url>"]);
    ctx.sqlFile = options.sqlFile;
    return;
  }
  if (sourceId === "zip") {
    ctx.zipFile = options.zip || (nonInteractive ? undefined : await askRequiredText("Path to the .zip archive:"));
    if (!ctx.zipFile) throw new MissingOptionError(["--zip <path>"]);
    ctx.sqlFile = options.sqlFile;
    return;
  }
  if (sourceId === "sql") {
    ctx.sqlFile = options.sqlFile || (nonInteractive ? undefined : await askRequiredText("Path to the .sql database dump:"));
    if (!ctx.sqlFile) throw new MissingOptionError(["--sql-file <path>"]);
  }
}

/**
 * Resolves ctx.profile for --source profile/ssh: a named/portable saved
 * profile (interactively picked, or offered to create on the spot, via the
 * same ProfileSelectionService `acli create`/`acli link` use), or (ssh) one
 * synthesized in-memory from the one-off --ssh-* flags — no temp file on
 * disk either way, unlike the round-trip the old `create --existing`
 * delegation needed to reuse --profile's file-path support.
 */
async function resolveProfileForImport(sourceId: string, options: ImportCommandOptions, ctx: any, nonInteractive: boolean): Promise<ProfileImportContext["profile"]> {
  let rawProfile: Profile;
  if (sourceId === "profile") {
    const { config } = await loadConfig({ configPath: options.config });
    const selection = await resolveProfileSelection({ config, options, attachedProfileName: undefined, required: true, nonInteractive });
    if (!nonInteractive) note(profileSummary(selection.profile!, ctx.environment), `Selected profile: ${selection.profileName}`);
    rawProfile = selection.profile!;
  } else {
    const sshHost = options.sshHost || (nonInteractive ? undefined : await askRequiredText("Remote SSH host:"));
    const sshUser = options.sshUser || (nonInteractive ? undefined : await askRequiredText("Remote SSH username:"));
    const remotePath = options.remotePath || (nonInteractive ? undefined : await askRequiredText("Remote WordPress root path:"));
    if (!sshHost || !sshUser || !remotePath) {
      throw new MissingOptionError(["--ssh-host <host>", "--ssh-user <user>", "--remote-path <path>"]);
    }
    rawProfile = {
      type: "wordpress",
      ssh: {
        host: sshHost,
        username: sshUser,
        port: options.sshPort ? Number(options.sshPort) : 22,
        identityFile: options.sshKey || "",
        hostKeyPolicy: "accept-new",
      },
      remote: { projectRoot: remotePath, wordpressRoot: "." },
      files: { transport: "rsync" },
      database: { driver: (options.dbDriver as Profile["database"]["driver"]) || "wp-cli" },
      ...(options.remoteUrl ? { urls: { staging: options.remoteUrl } } : {}),
    };
    validateProfileConfig(rawProfile, "--source ssh profile");
  }
  return resolveRemoteProfile(rawProfile, { projectName: ctx.projectName });
}


export function registerImportCommand(program: Command): void {
  program
    .command("import")
    .description("Import an existing WordPress site into a new local project")
    .option("--source <source>", "Import source: profile, ssh, local, git, sql, or zip")
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--dry-run", "Validate and print the execution plan without mutation")
    .option("--resume", "Continue an interrupted import run instead of starting over")
    // source: profile
    .option("--profile <profile>", "Use a named or portable staging profile (--source profile)")
    // source: ssh (one-off, no saved profile)
    .option("--ssh-host <host>", "Remote SSH host (--source ssh)")
    .option("--ssh-user <user>", "Remote SSH username (--source ssh)")
    .option("--ssh-port <port>", "Remote SSH port (--source ssh)")
    .option("--ssh-key <path>", "SSH private key path (--source ssh)")
    .option("--remote-path <path>", "Remote WordPress root (--source ssh)")
    .option("--db-driver <driver>", "Remote database driver: wp-cli, docker, or direct (--source ssh)")
    // source: local
    .option("--local-path <path>", "Path to an existing WordPress installation (--source local)")
    // source: git
    .option("--repo <url>", "Git repository URL containing wp-content (--source git)")
    .option("--branch <branch>", "Git branch to clone (--source git)")
    // source: zip
    .option("--zip <path>", "Path to a .zip archive containing wp-content (--source zip)")
    // shared: database dump (local, git, sql, zip)
    .option("--sql-file <path>", "Path to a .sql database dump")
    .option("--remote-url <url>", "The site's real/original URL, used as an extra search-replace source")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--skip-files", "Skip the file transfer step")
    .option("--skip-database", "Skip the database import step")
    .option("--skip-git-link", "Skip remote Git discovery and linking (--source profile/ssh)")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--keep-dump", "Keep staging.sql after a successful migration")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((options: ImportCommandOptions) => importCommand(options));
}
