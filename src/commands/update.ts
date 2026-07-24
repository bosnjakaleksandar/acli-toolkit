import chalk from "chalk";
import type { Command } from "commander";
import { installLatestVersion } from "../update/install.ts";
import { checkForUpdate } from "../update/checkForUpdate.ts";
import { BRANDING } from "../config/branding.ts";
import { mascot } from "../ui/acaCharacter.ts";
import type { PackageMetadata } from "../utils/packageMetadata.ts";

export async function updateCommand(packageName: string): Promise<void> {
  console.log(chalk.cyan(`Installing the latest version of ${packageName}...\n`));
  await mascot.show("working", "Installing the latest A-CLI version...");
  mascot.stop();
  try {
    await installLatestVersion(packageName);
  } catch (error) {
    await mascot.show("error", "A-CLI update failed.");
    mascot.stop();
    throw error;
  }
  await mascot.show("success", "A-CLI updated successfully.");
  mascot.stop();
  console.log(chalk.green("\n✔ Update completed successfully.\n"));
  console.log(`Please run:\n\n${chalk.cyan(BRANDING.command)}\n`);
}

/** Report-only variant for scripting: prints the result and sets exit code 1 if an update is available, without installing anything. */
export async function checkUpdateCommand(packageMetadata: PackageMetadata): Promise<void> {
  const { latestVersion } = await checkForUpdate({
    packageName: packageMetadata.name,
    currentVersion: packageMetadata.version,
    onOffline: () => { console.log(chalk.gray("Update check unavailable (offline or registry unreachable).")); },
  });
  if (latestVersion) {
    console.log(`${BRANDING.name} ${latestVersion} is available (current: ${packageMetadata.version}). Run \`acli update\` to install.`);
    process.exitCode = 1;
  } else {
    console.log(`${BRANDING.name} ${packageMetadata.version} is up to date.`);
  }
}

export function registerUpdateCommand(program: Command, { packageMetadata }: { packageMetadata: PackageMetadata }): void {
  program
    .command("update")
    .description("Install the latest published version globally")
    .option("--check", "Report whether an update is available without installing it (exit 1 if one is)")
    .action((options: { check?: boolean }) => options.check ? checkUpdateCommand(packageMetadata) : updateCommand(packageMetadata.name));
}
