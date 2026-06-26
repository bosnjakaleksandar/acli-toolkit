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
    .option("--name <name>", "Project directory/name")
    .option("--environment <environment>", "Local environment: docker or lando")
    .option("--env <environment>", "Alias for --environment")
    .option("--preset <preset>", "Use a built-in preset or path to a JSON preset file")
    .option("--existing", "Shortcut for setting up an existing WordPress project")
    .option("--type <type>", "Project type: application or wordpress")
    .option("--framework <framework>", "Application framework: react, nextjs, or next")
    .option("--laravel", "Add Laravel as a backend for application projects")
    .option("--wp-type <type>", "WordPress type: theme, woo, react, wp-theme, wp-woo, or wp-react")
    .option("--mysql <version>", "MySQL or MariaDB version")
    .option("--wp-version <version>", "WordPress version")
    .option("--theme-repo <url>", "Theme repository URL")
    .option("--theme-branch <branch>", "Theme repository branch")
    .option("--staging-url <url>", "Staging URL for existing WordPress search-replace")
    .option("--ssh-key <path>", "SSH private key path")
    .option("--skip-git", "Skip Git repository initialization")
    .option("--skip-knowledge-base", "Skip Knowledge Base registration")
    .option("--yes", "Run without interactive prompts when all required options are supplied")
    .option("--non-interactive", "Alias for --yes")
    .action((options) => createProjectCommand(options));

  program
    .command("doctor")
    .description("Verify local development requirements")
    .action(() => doctorCommand());

  await program.parseAsync(argv);
}
