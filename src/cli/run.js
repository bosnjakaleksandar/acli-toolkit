import { Command } from "commander";
import { createProjectCommand } from "../commands/createProject.js";
import { doctorCommand } from "../commands/doctor.js";

/**
 * CLI entry point.
 *
 * @param {string[]} argv Process argv.
 */
export async function run(argv = process.argv) {
  const program = new Command();

  program
    .name("create-project")
    .description("Scaffold Next.js, React, Laravel, WordPress, and existing WordPress projects.")
    .option("--preset <preset>", "Use a built-in preset or path to a JSON preset file")
    .action((options) => createProjectCommand(options));

  program
    .command("doctor")
    .description("Verify local development requirements")
    .action(() => doctorCommand());

  await program.parseAsync(argv);
}
