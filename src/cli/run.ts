import { Command } from "commander";
import { getPackageMetadata } from "../system/packageMetadata.ts";
import { maybeUpdate } from "../update/maybeUpdate.ts";
import { registerCommands } from "./program.ts";
import { BRANDING } from "../ui/branding.ts";
import { runMainMenu } from "./mainMenu.ts";

/**
 * CLI entry point.
 */
export async function run(argv: string[] = process.argv, { legacyExecutable = false }: { legacyExecutable?: boolean } = {}): Promise<void> {
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
    .action(async (options: any) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) return program.help();
      if (!(await runMainMenu(options))) program.help();
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

export function shouldCheckForUpdates(args: string[], env: Record<string, string | undefined> = process.env): boolean {
  if (env.CI) return false;
  // "doctor" is a fast, repeatable diagnostic command — people run it
  // several times in a row while troubleshooting, so it should never carry
  // the extra latency/interruption of an update check.
  const bypassArguments = new Set(["--skip-update", "--version", "-v", "--help", "-h", "update", "help", "doctor", "--yes", "--non-interactive", "--quiet"]);
  return !args.some((argument) => bypassArguments.has(argument));
}

function normalizeLegacyArguments(argv: string[]): string[] {
  const args = argv.slice(2);
  const rootArguments = new Set(["create", "import", "doctor", "update", "link", "pull", "help", "--help", "-h", "--version", "-v"]);
  if (args.some((argument) => rootArguments.has(argument))) return argv;
  return [...argv.slice(0, 2), "create", ...args];
}
