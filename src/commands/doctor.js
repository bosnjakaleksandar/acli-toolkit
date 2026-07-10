import chalk from "chalk";
import { intro, outro } from "@clack/prompts";
import { spawnSync } from "child_process";
import { BRANDING } from "../config/branding.js";
import { acaCharacter } from "../ui/acaCharacter.js";

const CHECKS = [
  { label: "Node.js", command: "node", args: ["--version"], required: true, fix: "Install Node.js 20 LTS or newer." },
  { label: "npm", command: "npm", args: ["--version"], required: true, fix: "Install npm with Node.js." },
  { label: "Git", command: "git", args: ["--version"], required: true, fix: "Install Git and make sure it is on PATH." },
  { label: "Docker", command: "docker", args: ["--version"], required: true, fix: "Install Docker Desktop and start it." },
  { label: "Docker Compose", command: "docker", args: ["compose", "version"], required: true, fix: "Install a Docker version that includes Compose v2." },
  { label: "Lando", command: "lando", args: ["--version"], required: true, fix: "Install Lando if you plan to use Lando environments." },
  { label: "Composer", command: "composer", args: ["--version"], required: true, fix: "Install Composer for Laravel generation." },
  { label: "PHP", command: "php", args: ["--version"], required: true, fix: "Install PHP 8.2 or newer for Laravel tooling." },
  { label: "SSH", command: "ssh", args: ["-V"], required: true, fix: "Install OpenSSH client." },
  { label: "WP CLI", command: "wp", args: ["--version"], required: false, fix: "Optional: install WP-CLI for local WordPress automation." },
];

/**
 * Runs the local toolchain doctor report.
 */
export async function doctorCommand() {
  intro(chalk.bgCyan(chalk.black(` 🩺 ${BRANDING.name} DOCTOR `)));

  await acaCharacter.play("thinking", "Checking local requirements...");
  acaCharacter.stop();

  const results = CHECKS.map(runCheck);
  const maxLabel = Math.max(...results.map((result) => result.label.length));

  for (const result of results) {
    const icon = result.ok ? chalk.green("✔") : result.required ? chalk.red("✖") : chalk.yellow("○");
    const label = result.label.padEnd(maxLabel, " ");
    const version = result.ok ? chalk.gray(result.version) : chalk.gray("not found");
    console.log(`${icon} ${label}  ${version}`);
    if (!result.ok) {
      console.log(chalk.gray(`  Fix: ${result.fix}`));
    }
  }

  const failedRequired = results.filter((result) => result.required && !result.ok);
  if (failedRequired.length) {
    await acaCharacter.play("warning", `Doctor found ${failedRequired.length} required issue(s).`);
    acaCharacter.stop();
    outro(chalk.red(`Doctor found ${failedRequired.length} required issue(s).`));
    process.exitCode = 1;
    return;
  }

  await acaCharacter.play("success", "All required tools are available.");
  acaCharacter.stop();
  outro(chalk.green("All required tools are available."));
}

export function registerDoctorCommand(program) {
  program
    .command("doctor")
    .description("Verify local development requirements")
    .action(() => doctorCommand());
}

function runCheck(check) {
  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    shell: false,
  });
  const output = result.stdout?.trim() || result.stderr?.trim() || "";

  return {
    ...check,
    ok: !result.error && result.status === 0,
    version: output.split("\n")[0],
  };
}
