import chalk from "chalk";
import { installLatestVersion } from "../update/install.js";
import { BRANDING } from "../config/branding.js";
import { mascot } from "../ui/acaCharacter.js";

export async function updateCommand(packageName) {
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

export function registerUpdateCommand(program, { packageMetadata }) {
  program
    .command("update")
    .description("Install the latest published version globally")
    .action(() => updateCommand(packageMetadata.name));
}
