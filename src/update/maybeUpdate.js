import chalk from "chalk";
import { checkForUpdate } from "./checkForUpdate.js";
import { installLatestVersion } from "./install.js";
import { confirmUpdate } from "../prompts/updatePrompt.js";
import { BRANDING } from "../config/branding.js";
import { acaCharacter } from "../ui/acaCharacter.js";

export async function maybeUpdate(packageMetadata) {
  acaCharacter.setState("thinking", "Checking for A-CLI updates...");
  const latestVersion = await checkForUpdate({
    packageName: packageMetadata.name,
    currentVersion: packageMetadata.version,
    onOffline: async () => {
      await acaCharacter.play("offline", "Update check unavailable; continuing.");
      acaCharacter.stop();
    },
  });
  if (acaCharacter.state === "thinking") acaCharacter.stop({ clear: true });
  if (!latestVersion || !process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (!(await confirmUpdate(packageMetadata.version, latestVersion))) {
    await acaCharacter.play("cancelled", "Update skipped; continuing.");
    acaCharacter.stop();
    return false;
  }

  console.log(chalk.cyan("\nInstalling the latest version...\n"));
  await acaCharacter.play("working", "Installing the latest A-CLI version...");
  acaCharacter.stop();
  try {
    await installLatestVersion(packageMetadata.name);
  } catch (error) {
    await acaCharacter.play("error", "A-CLI update failed.");
    acaCharacter.stop();
    throw error;
  }
  await acaCharacter.play("success", "A-CLI updated successfully.");
  acaCharacter.stop();
  console.log(chalk.green("\n✔ Update completed successfully.\n"));
  console.log(`Please run:\n\n${chalk.cyan(BRANDING.command)}\n`);
  return true;
}
