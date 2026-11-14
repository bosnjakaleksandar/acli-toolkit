import path from "node:path";
import fs from "fs-extra";
import { confirm, outro, select } from "@clack/prompts";
import chalk from "chalk";
import type { Command } from "commander";
import { ask, askMysqlVersion, askWpVersion } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { resolveProfileSelection, profileSummary } from "../../profiles/ProfileSelection.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { readLink, writeLink } from "../../profiles/ProjectLink.ts";
import { CliError } from "../../core/errors.ts";
import { validateProjectName } from "../../projects/plan/projectName.ts";
import { runCommand } from "../CommandShell.ts";
import type { LinkCommandOptions } from "../options.ts";
import { DEFAULT_MYSQL_VERSION, DEFAULT_WORDPRESS_VERSION } from "../../config/defaults.ts";
import { resolveRemoteProfile } from "../../providers/resolveProfile.ts";
import { createRemoteBackend } from "../../providers/registry.ts";
import { dbSpecFromServerVersion, phpSpecFromVersion, wpSpecFromVersion } from "../../environments/versions.ts";
import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";

const ENV_FILE_NAMES: Record<string, string> = { docker: "docker-compose.yaml", lando: ".lando.yml" };

export async function linkCommand(options: LinkCommandOptions = {}): Promise<void> {
  await runCommand({ title: "LINK", icon: "🔗" }, async () => {
    const cwd = process.cwd();
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const existing = await readLink(cwd);
    if (existing && !options.force) {
      throw new CliError(`This directory is already linked to "${existing.name}" (profile: ${existing.profile || "none"}).`, {
        code: "ALREADY_LINKED",
        hint: "Pass --force to relink with different settings.",
      });
    }

    const projectName = options.name || path.basename(cwd);
    const nameError = validateProjectName(projectName);
    if (nameError) throw new CliError(nameError, { code: "USAGE" });
    const environment: string = options.environment || (nonInteractive ? "docker" : await ask(select, { message: "Which local environment does this project use?", options: [{ label: "Docker Compose", value: "docker" }, { label: "Lando", value: "lando" }] }) as string);
    if (!["docker", "lando"].includes(environment)) throw new CliError(`Unknown local environment "${environment}".`, { code: "INVALID_ENVIRONMENT", hint: "Use docker or lando." });

    let { config } = await loadConfig({ configPath: options.config });
    const selection = await resolveProfileSelection({ config, options, attachedProfileName: undefined, required: true, nonInteractive });
    config = selection.config;
    if (!nonInteractive) console.log(chalk.gray(profileSummary(selection.profile!, environment, projectName)));

    const envFilePath = path.join(cwd, ENV_FILE_NAMES[environment]!);
    if (!(await fs.pathExists(envFilePath))) {
      const shouldScaffold = nonInteractive || await ask(confirm, { message: `No ${ENV_FILE_NAMES[environment]} found here. Generate one now?`, initialValue: true });
      if (shouldScaffold) {
        // Staging decides the runtime when it can report it; prompts (or
        // defaults) only fill in what it couldn't.
        const facts = await readStagingFacts(selection.profile!, projectName, options.remoteProject);
        const mysqlVersion = dbSpecFromServerVersion(facts?.dbVersion) ?? (nonInteractive ? String(config.defaults?.mysqlVersion || DEFAULT_MYSQL_VERSION) : await askMysqlVersion());
        const wpVersion = wpSpecFromVersion(facts?.wpVersion) ?? (nonInteractive
          ? config.defaults?.wpVersion || DEFAULT_WORDPRESS_VERSION
          : await askWpVersion());
        const phpVersion = phpSpecFromVersion(facts?.phpVersion) ?? undefined;
        if (facts?.dbVersion || facts?.phpVersion) console.log(chalk.gray(`Matching staging: PHP ${phpVersion ?? "default"}, DB ${mysqlVersion}, WordPress ${wpVersion}.`));
        const tablePrefix = facts?.tablePrefix && /^[A-Za-z0-9_]+$/.test(facts.tablePrefix) ? facts.tablePrefix : "wp_";
        const envService = resolveEnvironmentService(environment);
        await envService.scaffold(cwd, "wordpress", { projectName, mysqlVersion, phpVersion, wpVersion, tablePrefix });
      }
    }

    const filePath = await writeLink(cwd, {
      name: projectName,
      type: "wordpress",
      environment,
      profile: selection.profileName,
      ...(options.remoteProject && options.remoteProject !== projectName ? { remoteProject: options.remoteProject } : {}),
      linkedAt: new Date().toISOString(),
    });

    outro(chalk.green(`Linked "${projectName}" to profile "${selection.profileName}" (${filePath}).\nRun \`acli pull\` to sync files and the database.`));
  });
}

/** Best effort: the staging server's runtime facts, or null when the provider can't report them or the lookup fails. */
async function readStagingFacts(profile: Parameters<typeof resolveRemoteProfile>[0], projectName: string, remoteProject?: string): Promise<RemoteFacts | null> {
  try {
    const resolved = resolveRemoteProfile(profile, { projectName, ...(remoteProject ? { remoteProject } : {}) });
    return await createRemoteBackend(resolved).getRemoteFacts();
  } catch {
    return null;
  }
}

export function registerLinkCommand(program: Command): void {
  program
    .command("link")
    .description("Connect an existing local directory to a staging profile")
    .option("--name <name>", "Project name (defaults to the current directory name)")
    .option("--remote-project <name>", "The project's name on the server, when it differs from the local name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--profile <profile>", "Use a named staging profile")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--force", "Relink a directory that is already linked")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action(linkCommand);
}
