import path from "node:path";
import fs from "fs-extra";
import { confirm, intro, outro, select } from "@clack/prompts";
import chalk from "chalk";
import type { Command } from "commander";
import { ask, askMysqlVersion, askWpVersion } from "../utils/prompts.ts";
import { loadConfig } from "../services/ConfigService.ts";
import { resolveProfileSelection, profileSummary } from "../services/ProfileSelectionService.ts";
import { resolveEnvironmentService } from "../services/EnvironmentResolver.ts";
import { readLink, writeLink } from "../services/ProjectLinkService.ts";
import { BRANDING } from "../config/branding.ts";
import { CliError, describeError } from "../core/errors.ts";
import type { LinkCommandOptions } from "../cli/options.ts";

const ENV_FILE_NAMES: Record<string, string> = { docker: "docker-compose.yaml", lando: ".lando.yml" };

export async function linkCommand(options: LinkCommandOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const nonInteractive = Boolean(options.yes || options.nonInteractive);
  intro(chalk.bgCyan(chalk.black(` 🔗 ${BRANDING.name} LINK `)));

  try {
    const existing = await readLink(cwd);
    if (existing && !options.force) {
      throw new CliError(`This directory is already linked to "${existing.name}" (profile: ${existing.profile || "none"}).`, {
        code: "ALREADY_LINKED",
        hint: "Pass --force to relink with different settings.",
      });
    }

    const projectName = options.name || path.basename(cwd);
    const environment: string = options.environment || (nonInteractive ? "docker" : await ask(select, { message: "Which local environment does this project use?", options: [{ label: "Docker Compose", value: "docker" }, { label: "Lando", value: "lando" }] }) as string);
    if (!["docker", "lando"].includes(environment)) throw new CliError(`Unknown local environment "${environment}".`, { code: "INVALID_ENVIRONMENT", hint: "Use docker or lando." });

    let { config } = await loadConfig({ configPath: options.config });
    const selection = await resolveProfileSelection({ config, options, attachedProfileName: undefined, required: true, nonInteractive });
    config = selection.config;
    if (!nonInteractive) console.log(chalk.gray(profileSummary(selection.profile!, environment)));

    const envFilePath = path.join(cwd, ENV_FILE_NAMES[environment]!);
    if (!(await fs.pathExists(envFilePath))) {
      const shouldScaffold = nonInteractive || await ask(confirm, { message: `No ${ENV_FILE_NAMES[environment]} found here. Generate one now?`, initialValue: true });
      if (shouldScaffold) {
        const mysqlVersion = nonInteractive ? "8.0" : await askMysqlVersion();
        const wpVersion = environment === "docker" ? (nonInteractive ? "latest" : await askWpVersion()) : "latest";
        const envService = resolveEnvironmentService(environment);
        await envService.scaffold(cwd, "wordpress", { projectName, mysqlVersion, wpVersion, tablePrefix: "wp_" });
      }
    }

    const filePath = await writeLink(cwd, {
      name: projectName,
      type: "wordpress",
      environment,
      profile: selection.profileName,
      linkedAt: new Date().toISOString(),
    });

    outro(chalk.green(`Linked "${projectName}" to profile "${selection.profileName}" (${filePath}).\nRun \`acli pull\` to sync files and the database.`));
  } catch (error: any) {
    console.log(chalk.red(`✖ ${describeError(error)}`));
    if (error.hint) console.log(chalk.gray(`  ${error.hint}`));
    if (process.env.ACLI_DEBUG === "1" && error?.stack) console.error(error.stack);
    process.exitCode = error.exitCode || 1;
  }
}

export function registerLinkCommand(program: Command): void {
  program
    .command("link")
    .description("Connect an existing local directory to a staging profile")
    .option("--name <name>", "Project name (defaults to the current directory name)")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--profile <profile>", "Use a named or portable remote environment profile")
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--force", "Relink a directory that is already linked")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action(linkCommand);
}
