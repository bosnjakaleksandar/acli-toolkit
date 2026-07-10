import chalk from "chalk";
import { installLatestVersion } from "../update/install.js";
import { BRANDING } from "../config/branding.js";
import { acaCharacter } from "../ui/acaCharacter.js";

export async function updateCommand(packageName) {
  console.log(chalk.cyan(`Installing the latest version of ${packageName}...\n`));
  await acaCharacter.play("working", "Installing the latest A-CLI version...");
  acaCharacter.stop();
  try {
    await installLatestVersion(packageName);
  } catch (error) {
    await acaCharacter.play("error", "A-CLI update failed.");
    acaCharacter.stop();
    throw error;
  }
  await acaCharacter.play("success", "A-CLI updated successfully.");
  acaCharacter.stop();
  console.log(chalk.green("\n✔ Update completed successfully.\n"));
  console.log(`Please run:\n\n${chalk.cyan(BRANDING.command)}\n`);
}

export function registerUpdateCommand(program, { packageMetadata }) {
  program
    .command("update")
    .description("Install the latest published version globally")
    .action(() => updateCommand(packageMetadata.name));
}
