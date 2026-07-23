import { Command } from "commander";
import { getPackageMetadata } from "../utils/packageMetadata.ts";
import { maybeUpdate } from "../update/maybeUpdate.ts";
import { registerCommands } from "./registerCommands.js";
import { BRANDING } from "../config/branding.ts";
import { select } from "@clack/prompts";
import { ask } from "../utils/prompts.ts";
import { createProjectCommand } from "../commands/createProject.js";
import { importCommand } from "../commands/import.js";
import { doctorCommand } from "../commands/doctor.ts";
import { linkCommand } from "../commands/link.ts";
import { pullCommand } from "../commands/pull.ts";
import { showBanner } from "../utils/banner.ts";

/**
 * CLI entry point.
 *
 * @param {string[]} argv Process argv.
 */
export async function run(argv = process.argv, { legacyExecutable = false } = {}) {
  const packageMetadata = await getPackageMetadata();
  const normalizedArgv = legacyExecutable ? normalizeLegacyArguments(argv) : argv;
  const args = normalizedArgv.slice(2);
  if (shouldCheckForUpdates(args) && await maybeUpdate(packageMetadata)) return;

  const program = new Command();

  program
    .name(BRANDING.command)
    .description(`${BRANDING.name} ${BRANDING.subtitle}`)
    .version(packageMetadata.version, "-v, --version", "output the current version")
    .option("--skip-update", "Bypass the automatic update check")
    .option("--verbose", "Show commands and detailed progress")
    .option("--debug", "Show debug details and stack traces")
    .option("--quiet", "Suppress decorative output")
    .showSuggestionAfterError(true)
    .action(async (options) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) return program.help();
      await showBanner();
      const action = await ask(select, {
        message: "What would you like to do?",
        options: [
          { label: "Create a project", value: "create" },
          { label: "Import an existing WordPress site", value: "import" },
          { label: "Link an existing project to a staging profile", value: "link" },
          { label: "Pull files/database from a linked profile", value: "pull" },
          { label: "Check system requirements", value: "doctor" },
          { label: "Show command help", value: "help" },
        ],
      });
      if (action === "create") return createProjectCommand(options);
      if (action === "import") return importCommand(options);
      if (action === "link") return linkCommand(options);
      if (action === "pull") return pullCommand([], options);
      if (action === "doctor") return doctorCommand(options);
      return program.help();
    });

  program.hook("preAction", (_command, actionCommand) => {
    const root = actionCommand.optsWithGlobals();
    if (root.verbose) process.env.ACLI_VERBOSE = "1";
    if (root.debug) process.env.ACLI_DEBUG = "1";
    if (root.quiet) process.env.ACLI_QUIET = "1";
  });

  registerCommands(program, { packageMetadata });

  await program.parseAsync(normalizedArgv);
}

export function shouldCheckForUpdates(args, env = process.env) {
  if (env.CI) return false;
  // "doctor" is a fast, repeatable diagnostic command — people run it
  // several times in a row while troubleshooting, so it should never carry
  // the extra latency/interruption of an update check.
  const bypassArguments = new Set(["--skip-update", "--version", "-v", "--help", "-h", "update", "help", "doctor", "--yes", "--non-interactive", "--quiet"]);
  return !args.some((argument) => bypassArguments.has(argument));
}

function normalizeLegacyArguments(argv) {
  const args = argv.slice(2);
  const rootArguments = new Set(["create", "import", "doctor", "update", "link", "pull", "help", "--help", "-h", "--version", "-v"]);
  if (args.some((argument) => rootArguments.has(argument))) return argv;
  return [...argv.slice(0, 2), "create", ...args];
}
