import chalk from "chalk";
import { checkForUpdate, markUpdateNotified } from "./checkForUpdate.ts";
import { installLatestVersion } from "./install.ts";
import { confirmUpdate } from "../prompts/updatePrompt.js";
import { BRANDING } from "../config/branding.ts";
import { mascot } from "../ui/acaCharacter.ts";
import type { PackageMetadata } from "../utils/packageMetadata.ts";

export async function maybeUpdate(packageMetadata: PackageMetadata): Promise<boolean> {
  mascot.show("thinking", "Checking for A-CLI updates...");
  const { latestVersion, alreadyNotified } = await checkForUpdate({
    packageName: packageMetadata.name,
    currentVersion: packageMetadata.version,
    onOffline: async () => {
      await mascot.show("offline", "Update check unavailable; continuing.");
      mascot.stop();
    },
  });
  if (mascot.state === "thinking") mascot.stop({ clear: true });
  if (!latestVersion || !process.stdin.isTTY || !process.stdout.isTTY) return false;

  // Already asked about this exact version earlier in the same check
  // window (e.g. running `doctor` a few times in a row while debugging) —
  // don't interrupt again with a full prompt, just a quiet reminder.
  if (alreadyNotified) {
    console.log(chalk.gray(`\nA-CLI ${latestVersion} is available (current: ${packageMetadata.version}). Run \`acli update\` to install.\n`));
    return false;
  }
  await markUpdateNotified(latestVersion);

  if (!(await confirmUpdate(packageMetadata.version, latestVersion))) {
    await mascot.show("cancelled", "Update skipped; continuing.");
    mascot.stop();
    return false;
  }

  console.log(chalk.cyan("\nInstalling the latest version...\n"));
  await mascot.show("working", "Installing the latest A-CLI version...");
  mascot.stop();
  try {
    await installLatestVersion(packageMetadata.name);
  } catch (error) {
    await mascot.show("error", "A-CLI update failed.");
    mascot.stop();
    throw error;
  }
  await mascot.show("success", "A-CLI updated successfully.");
  mascot.stop();
  console.log(chalk.green("\n✔ Update completed successfully.\n"));
  console.log(`Please run:\n\n${chalk.cyan(BRANDING.command)}\n`);
  return true;
}
