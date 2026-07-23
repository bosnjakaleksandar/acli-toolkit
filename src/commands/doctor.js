import chalk from "chalk";
import { intro, outro } from "@clack/prompts";
import { BRANDING } from "../config/branding.ts";
import { mascot } from "../ui/acaCharacter.js";
import { loadConfig } from "../services/ConfigService.ts";
import { loadPreset, loadProfile } from "../services/PresetService.ts";
import { checkTool } from "../services/ToolCheckService.ts";

export async function doctorCommand(options = {}) {
  if (!options.json) intro(chalk.bgCyan(chalk.black(` 🩺 ${BRANDING.name} DOCTOR `)));
  if (!options.json) { await mascot.show("thinking", "Checking workflow requirements..."); mascot.stop(); }
  const { config } = await loadConfig({ configPath: options.config });
  const preset = await loadPreset(options.preset, config);
  const profile = await loadProfile(options.profile || preset.profile, config);
  const requirements = new Set(["node", "npm", "git"]);
  const environment = options.environment || preset.environment || config.defaults?.environment;
  if (environment) requirements.add(environment);
  if (preset.useLaravel) { requirements.add("composer"); requirements.add("php"); }
  if (profile) { requirements.add("ssh"); requirements.add(profile.files?.transport === "sftp" ? "scp" : "rsync"); }
  const results = [...requirements].map((key) => checkTool(key)).filter(Boolean);
  if (options.json) {
    console.log(JSON.stringify({ ok: results.every((result) => result.ok), checks: results.map(({ label, ok, version, fix }) => ({ label, ok, version, ...(!ok ? { fix } : {}) })) }, null, 2));
    if (results.some((result) => !result.ok)) process.exitCode = 1;
    return;
  }
  const maxLabel = Math.max(...results.map((result) => result.label.length));
  for (const result of results) {
    console.log(`${result.ok ? chalk.green("✔") : chalk.red("✖")} ${result.label.padEnd(maxLabel)}  ${chalk.gray(result.ok ? result.version : "not found")}`);
    if (!result.ok) console.log(chalk.gray(`  Fix: ${result.fix}`));
  }
  const failed = results.filter((result) => !result.ok);
  if (options.fix) console.log(chalk.gray("No automatic system changes were made. A-CLI only applies explicitly supported safe fixes."));
  if (failed.length) { outro(chalk.red(`Doctor found ${failed.length} issue(s).`)); process.exitCode = 1; return; }
  outro(chalk.green("All selected workflow requirements are available."));
}

export function registerDoctorCommand(program) {
  program.command("doctor").description("Verify requirements for a selected workflow")
    .option("--preset <preset>").option("--profile <profile>").option("--config <path>").option("--environment <environment>").option("--json", "Output machine-readable JSON").option("--fix", "Apply explicitly supported safe fixes")
    .action(doctorCommand);
}
