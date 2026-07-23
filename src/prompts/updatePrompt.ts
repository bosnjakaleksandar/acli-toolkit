import { confirm, isCancel } from "@clack/prompts";
import chalk from "chalk";
import { BRANDING } from "../config/branding.ts";

export async function confirmUpdate(currentVersion: string, latestVersion: string): Promise<boolean> {
  const line = chalk.gray("─".repeat(42));
  console.log(`\n${line}\n`);
  console.log(chalk.bold(`A new version of ${BRANDING.name} is available.\n`));
  console.log(`Current version : ${chalk.yellow(currentVersion)}`);
  console.log(`Latest version  : ${chalk.green(latestVersion)}\n`);
  const answer = await confirm({ message: "Would you like to install it now?", initialValue: true });
  console.log(`${line}\n`);
  return !isCancel(answer) && answer;
}
