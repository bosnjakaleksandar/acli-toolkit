import { confirm, multiselect, outro, spinner } from "@clack/prompts";
import chalk from "chalk";
import path from "node:path";
import type { Command } from "commander";
import { ask } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { loadProfile } from "../../profiles/loadProfile.ts";
import { resolveRemoteProfile } from "../../providers/resolveProfile.ts";
import { findProjectRoot, readLink, rememberSelections } from "../../profiles/ProjectLink.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { PullService, resolvePullTargets } from "../../wordpress/pull/PullService.ts";
import { mascot } from "../../ui/mascot.ts";
import { mergeGitignoreForImport } from "../../system/gitignore.ts";
import { CliError } from "../../core/errors.ts";
import { runCommand } from "../CommandShell.ts";
import type { PullCommandOptions } from "../options.ts";

export async function pullCommand(targets: string[], options: PullCommandOptions = {}): Promise<void> {
  await runCommand({ title: "PULL", icon: "⬇", failureMessage: "Pull failed." }, async () => {
    const cwd = process.cwd();
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const projectRoot = await findProjectRoot(cwd);
    if (!projectRoot) {
      throw new CliError("This directory is not linked to a staging profile.", {
        code: "NOT_LINKED",
        hint: "Run `acli link` first, or start the project with `acli import`, which links it automatically.",
      });
    }
    const link = await readLink(projectRoot);
    if (!link) {
      throw new CliError("This project link disappeared while it was being read.", {
        code: "NOT_LINKED",
        hint: "Run `acli link` again, then retry the pull.",
      });
    }
    if (!link.profile) {
      throw new CliError(`"${link.name}" is linked but has no profile attached.`, {
        code: "NO_PROFILE_LINKED",
        hint: "Run `acli link --force` to attach a profile.",
      });
    }

    const explicitConfigPath = options.config ? path.resolve(cwd, options.config) : undefined;
    const { config } = await loadConfig({ cwd: projectRoot, configPath: explicitConfigPath });
    const rawProfile = loadProfile(link.profile, config);
    if (!rawProfile) throw new CliError(`Profile "${link.profile}" was not found.`, { code: "PROFILE_NOT_FOUND" });
    const profile = resolveRemoteProfile(rawProfile, { projectName: link.name, ...(link.remoteProject ? { remoteProject: link.remoteProject } : {}), ...(link.selections ? { selections: link.selections } : {}) });

    const envService = resolveEnvironmentService(link.environment);
    const pull = new PullService(envService);
    const available = pull.availableTargets(profile);
    let finalTargets: string[];
    if (targets && targets.length) {
      finalTargets = resolvePullTargets(targets, available);
    } else if (nonInteractive) {
      finalTargets = resolvePullTargets([], available);
    } else {
      finalTargets = (await ask(multiselect, {
        message: "What do you want to pull?",
        options: available.map((target) => ({ label: target, value: target })),
        initialValues: available,
        required: true,
      })) as string[];
    }

    if (options.dryRun) {
      console.log(JSON.stringify({ project: link.name, environment: link.environment, targets: finalTargets, profile: link.profile }, null, 2));
      outro(chalk.green("Dry run complete. No files or remote state were changed."));
      return;
    }

    if (finalTargets.includes("db") && !options.yes && !nonInteractive) {
      const proceed = await ask(confirm, { message: "This replaces your local database with a copy from the remote site. Continue?", initialValue: false });
      if (!proceed) { outro(chalk.yellow("Pull cancelled. No changes were made.")); return; }
    }

    // Projects imported by an older A-CLI still have the repository's
    // .gitignore; A-CLI's rules take over on every pull (idempotent).
    await mergeGitignoreForImport(projectRoot, "wordpress");

    // Answers to the server's "which container/database?" prompts are saved
    // to the project link, so the next pull doesn't ask again.
    const selections: Record<string, string> = {};
    const ctx = { projectName: link.name, environment: link.environment, profile, keepDump: Boolean(options.keepDump), nonInteractive, resumeCommand: "acli pull db --keep-dump", onSelection: (key: string, value: string) => { selections[key] = value; } };

    await mascot.show("working", `Pulling ${finalTargets.join(", ")}...`);
    mascot.stop();
    const s = spinner();
    s.start(`Pulling ${finalTargets.join(", ")}...`);
    try {
      await pull.pull(projectRoot, ctx, finalTargets, { keepDump: Boolean(options.keepDump) }, s);
    } finally {
      await rememberSelections(projectRoot, link, selections);
    }
    s.stop("Pull complete.");

    await mascot.show("success", "Pull complete.");
    mascot.stop();
    outro(chalk.green(`Pulled ${finalTargets.join(", ")} for "${link.name}".`));
  });
}

export function registerPullCommand(program: Command): void {
  program
    .command("pull [targets...]")
    .description("Selectively sync files and/or the database from the linked staging profile")
    .addHelpText("after", `\nTargets: db, plus the profile's file targets (uploads, plugins, themes by default; Coolify also has languages), or "full" for everything. Omit to pick interactively (or pull everything, non-interactively).\n\nExamples:\n  acli pull db\n  acli pull uploads plugins themes\n  acli pull full --yes`)
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--keep-dump", "Keep staging.sql after a successful database pull")
    .option("--dry-run", "Print the resolved plan without pulling anything")
    .option("--yes", "Skip confirmation prompts")
    .option("--non-interactive", "Alias for --yes")
    .action((targets: string[], options: PullCommandOptions) => pullCommand(targets, options));
}
