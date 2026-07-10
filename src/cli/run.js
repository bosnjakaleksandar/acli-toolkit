import { Command } from "commander";
import { getPackageMetadata } from "../utils/packageMetadata.js";
import { maybeUpdate } from "../update/maybeUpdate.js";
import { registerCommands } from "./registerCommands.js";
import { BRANDING } from "../config/branding.js";

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
    .action(() => program.help());

  registerCommands(program, { packageMetadata });

  await program.parseAsync(normalizedArgv);
}

function shouldCheckForUpdates(args) {
  const bypassArguments = new Set(["--skip-update", "--version", "-v", "--help", "-h", "update", "help"]);
  return !args.some((argument) => bypassArguments.has(argument));
}

function normalizeLegacyArguments(argv) {
  const args = argv.slice(2);
  const rootArguments = new Set(["create", "doctor", "update", "help", "--help", "-h", "--version", "-v"]);
  if (args.some((argument) => rootArguments.has(argument))) return argv;
  return [...argv.slice(0, 2), "create", ...args];
}
