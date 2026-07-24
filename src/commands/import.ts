import { intro, note, outro, spinner } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { Command } from "commander";
import { BRANDING } from "../config/branding.ts";
import { mascot } from "../ui/acaCharacter.ts";
import { CliError, TargetExistsError } from "../core/errors.ts";
import { readStepState } from "../core/StepRunner.ts";
import { ImportSourceRegistry } from "../features/import/ImportSource.ts";
import { LocalFolderSource } from "../features/import/sources/LocalFolderSource.ts";
import { GitSource } from "../features/import/sources/GitSource.ts";
import { SqlManualSource } from "../features/import/sources/SqlManualSource.ts";
import { ZipSource } from "../features/import/sources/ZipSource.ts";
import { runImportWorkflow } from "../features/import/ImportWorkflow.ts";
import { resolveEnvironmentService } from "../services/EnvironmentResolver.ts";
import { maybeInstallDependencies } from "../services/DependencyInstallService.ts";
import { maybeInitializeGit } from "../services/GitService.ts";
import { buildNextSteps } from "../services/NextStepsService.ts";
import { runLocalPreflight } from "../services/PreflightService.ts";
import { validateProjectName } from "../services/ProjectValidationService.ts";
import { buildSuccessSummary, formatCreateError } from "../services/CreateProjectUxService.ts";
import { createProjectCommand } from "./createProject.ts";

const importSourceRegistry = new ImportSourceRegistry();
importSourceRegistry.register(LocalFolderSource);
importSourceRegistry.register(GitSource);
importSourceRegistry.register(SqlManualSource);
importSourceRegistry.register(ZipSource);

// "profile" (a saved staging profile) and "ssh" (a one-off target with no
// saved profile) both describe *remote* WordPress hosts, and are served by
// delegating to the existing, already-proven `create --existing` pipeline
// (RemoteProfileService, PullService, DatabaseDumpService,
// WordPressMigrationService) rather than a second implementation of the
// same remote-sync logic.
const REMOTE_SOURCES = new Set(["profile", "ssh"]);

/**
 * `acli import`: brings an existing WordPress site into a new local
 * project. Dispatches to one of two implementations depending on --source:
 * remote sources reuse `create --existing` unchanged; local sources (local
 * folder, git, zip, a manual sql dump) run the newer, source-agnostic
 * ImportWorkflow.
 */
export async function importCommand(options: any = {}): Promise<void> {
  const source = options.source || "profile";
  if (REMOTE_SOURCES.has(source)) return importViaRemote(source, options);
  return importViaLocalSource(source, options);
}

async function importViaRemote(source: string, options: any): Promise<void> {
  if (source === "profile") {
    return createProjectCommand({ ...options, existing: true, _viaImportCommand: true });
  }

  // source === "ssh": no saved profile — synthesize a portable one from the
  // one-off flags and feed it through the same machinery via loadProfile's
  // existing support for a file path in --profile.
  if (!options.sshHost || !options.sshUser || !options.remotePath) {
    throw new CliError("--source ssh requires --ssh-host, --ssh-user, and --remote-path.", { code: "USAGE" });
  }
  const tempProfile = {
    type: "wordpress",
    ssh: {
      host: options.sshHost,
      username: options.sshUser,
      port: options.sshPort ? Number(options.sshPort) : 22,
      identityFile: options.sshKey || "",
      hostKeyPolicy: "accept-new",
    },
    remote: { projectRoot: options.remotePath, wordpressRoot: "." },
    files: { transport: "rsync" },
    database: { driver: options.dbDriver || "wp-cli" },
    ...(options.remoteUrl ? { urls: { staging: options.remoteUrl } } : {}),
  };
  const tempPath = path.join(os.tmpdir(), `acli-import-ssh-${process.pid}-${Date.now()}.yaml`);
  // Contains an SSH host/user/identityFile path in a shared, predictably-named
  // temp directory — keep it private rather than at the default umask.
  await fs.writeFile(tempPath, YAML.stringify(tempProfile), { mode: 0o600 });
  try {
    return await createProjectCommand({ ...options, existing: true, profile: tempPath, _viaImportCommand: true });
  } finally {
    await fs.remove(tempPath).catch(() => {});
  }
}

async function importViaLocalSource(sourceId: string, options: any): Promise<void> {
  intro(chalk.bgCyan(chalk.black(` 📥 ${BRANDING.name} IMPORT `)));

  let targetDir = "";
  let ownsTargetDir = false;
  let ctx: any = null;
  let s: ReturnType<typeof spinner> | null = null;

  try {
    const source = importSourceRegistry.get(sourceId);

    if (!options.name) throw new CliError("--name <directory> is required.", { code: "USAGE" });
    const nameError = validateProjectName(options.name);
    if (nameError) throw new CliError(nameError, { code: "USAGE" });
    const environment = options.environment || "docker";
    if (!["docker", "lando"].includes(environment)) {
      throw new CliError(`--environment must be "docker" or "lando" (got "${environment}").`, { code: "USAGE" });
    }

    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    ctx = {
      projectName: options.name,
      environment,
      appType: "wordpress",
      setupType: "existing-wp",
      projectType: "wp-existing",
      mysqlVersion: options.mysql || "8.0",
      localPath: options.localPath,
      repositoryUrl: options.repo,
      branch: options.branch,
      zipFile: options.zip,
      sqlFile: options.sqlFile,
      skipFiles: Boolean(options.skipFiles),
      skipDatabase: Boolean(options.skipDatabase),
      skipGitInit: Boolean(options.skipGit),
      stagingUrl: options.remoteUrl,
      nonInteractive,
    };

    targetDir = path.join(process.cwd(), ctx.projectName);
    ctx.targetDir = targetDir;

    if (options.dryRun) {
      note(
        JSON.stringify({ source: sourceId, project: ctx.projectName, localEnvironment: ctx.environment }, null, 2),
        "Import plan",
      );
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

    await runImportWorkflow({ source, ctx, targetDir, envService, spinner: s, resume: Boolean(options.resume) });
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
  } catch (error: any) {
    if (s) s.stop(chalk.red("A critical error occurred."));
    const resumeCommand = ownsTargetDir && ctx?.projectName ? `acli import --source ${sourceId} --resume --name ${ctx.projectName}` : null;
    await mascot.show("error", "Import failed.");
    mascot.stop();
    console.log(formatCreateError(error, { targetDir, ownsTargetDir, resumeCommand, action: "Import" }));
    if (process.env.ACLI_DEBUG === "1" && error?.stack) console.error(error.stack);
    process.exitCode = error.exitCode || 1;
  }
}

export function registerImportCommand(program: Command): void {
  program
    .command("import")
    .description("Import an existing WordPress site into a new local project")
    .option("--source <source>", "Import source: profile, ssh, local, git, sql, or zip", "profile")
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
    .action((options: any) => importCommand(options));
}
