import { confirm, multiselect, outro, spinner } from "@clack/prompts";
import chalk from "chalk";
import type { Command } from "commander";
import { ask } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { loadProfile } from "../../profiles/loadProfile.ts";
import { resolveRemoteProfile } from "../../remote/resolveProfile.ts";
import { readLink } from "../../profiles/ProjectLink.ts";
import { resolveEnvironmentService } from "../../environments/EnvironmentRegistry.ts";
import { PullService, resolvePullTargets, ALL_TARGETS } from "../../wordpress/pull/PullService.ts";
import { mascot } from "../../ui/mascot.ts";
import { CliError } from "../../core/errors.ts";
import { runCommand } from "../CommandShell.ts";
import type { PullCommandOptions } from "../options.ts";

export async function pullCommand(targets: string[], options: PullCommandOptions = {}): Promise<void> {
  await runCommand({ title: "PULL", icon: "⬇", failureMessage: "Pull failed." }, async () => {
    const cwd = process.cwd();
    const nonInteractive = Boolean(options.yes || options.nonInteractive);
    const link = await readLink(cwd);
    if (!link) {
      throw new CliError("This directory is not linked to a staging profile.", {
        code: "NOT_LINKED",
        hint: "Run `acli link` first (or `acli create --existing`, which links automatically).",
      });
    }
    if (!link.profile) {
      throw new CliError(`"${link.name}" is linked but has no profile attached.`, {
        code: "NO_PROFILE_LINKED",
        hint: "Run `acli link --force` to attach a profile.",
      });
    }

    let finalTargets: string[];
    if (targets && targets.length) {
      finalTargets = resolvePullTargets(targets);
    } else if (nonInteractive) {
      finalTargets = resolvePullTargets([]);
    } else {
      finalTargets = (await ask(multiselect, {
        message: "What do you want to pull?",
        options: ALL_TARGETS.map((target) => ({ label: target, value: target })),
        initialValues: ALL_TARGETS,
        required: true,
      })) as string[];
    }

    const { config } = await loadConfig({ configPath: options.config });
    const rawProfile = typeof link.profile === "string" ? await loadProfile(link.profile, config) : link.profile;
    if (!rawProfile) throw new CliError(`Profile "${link.profile}" was not found.`, { code: "PROFILE_NOT_FOUND" });
    const profile = resolveRemoteProfile(rawProfile, { projectName: link.name });

    if (options.dryRun) {
      console.log(JSON.stringify({ project: link.name, environment: link.environment, targets: finalTargets, profile: typeof link.profile === "string" ? link.profile : "(inline)" }, null, 2));
      outro(chalk.green("Dry run complete. No files or remote state were changed."));
      return;
    }

    if (finalTargets.includes("db") && !options.yes && !nonInteractive) {
      const proceed = await ask(confirm, { message: "This replaces your local database with a copy from the remote site. Continue?", initialValue: false });
      if (!proceed) { outro(chalk.yellow("Pull cancelled. No changes were made.")); return; }
    }

    const envService = resolveEnvironmentService(link.environment);
    const pull = new PullService(envService);
    const ctx = { projectName: link.name, environment: link.environment, profile, keepDump: Boolean(options.keepDump) };

    await mascot.show("working", `Pulling ${finalTargets.join(", ")}...`);
    mascot.stop();
    const s = spinner();
    s.start(`Pulling ${finalTargets.join(", ")}...`);
    await pull.pull(cwd, ctx, finalTargets, { keepDump: Boolean(options.keepDump) }, s);
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
    .addHelpText("after", `\nTargets: ${ALL_TARGETS.join(", ")}, or "full" for everything. Omit to pick interactively (or pull everything, non-interactively).\n\nExamples:\n  acli pull db\n  acli pull uploads plugins themes\n  acli pull full --yes`)
    .option("--config <path>", "Use an explicit A-CLI configuration file")
    .option("--keep-dump", "Keep staging.sql after a successful database pull")
    .option("--dry-run", "Print the resolved plan without pulling anything")
    .option("--yes", "Skip confirmation prompts")
    .option("--non-interactive", "Alias for --yes")
    .action((targets: string[], options: PullCommandOptions) => pullCommand(targets, options));
}
