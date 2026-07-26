import fs from "fs-extra";
import { note, select } from "@clack/prompts";
import { ask } from "../ui/prompts.ts";
import { showBanner } from "../ui/banner.ts";
import { getUserConfigPath } from "../config/paths.ts";
import { createProjectCommand } from "./commands/create.ts";
import { importCommand } from "./commands/import.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { linkCommand } from "./commands/link.ts";
import { pullCommand } from "./commands/pull.ts";

/** Entries in the bare-`acli` menu, paired with the handler each one runs. */
const MENU: Array<{ label: string; value: string; run: (options: any) => Promise<void> }> = [
  { label: "Create a project", value: "create", run: (options) => createProjectCommand(options) },
  { label: "Import an existing WordPress site", value: "import", run: (options) => importCommand(options) },
  { label: "Link an existing project to a staging profile", value: "link", run: (options) => linkCommand(options) },
  { label: "Pull files/database from a linked profile", value: "pull", run: (options) => pullCommand([], options) },
  { label: "Check system requirements", value: "doctor", run: (options) => doctorCommand(options) },
];

/**
 * The interactive menu shown when `acli` is run with no command at all.
 * Returns false when the user asked for help instead of picking an action,
 * leaving it to the caller to print Commander's own help — this module has
 * no business holding a reference to the program for that.
 */
export async function runMainMenu(options: any): Promise<boolean> {
  await showBanner();
  if (!(await fs.pathExists(getUserConfigPath()))) {
    note(
      "No configuration found yet — that's normal for a first run.\nRun `acli config init` to write a starter config, or just pick an option below;\ncommands that need a staging profile will offer to create one on the spot.",
      "Get started",
    );
  }

  const action = await ask(select, {
    message: "What would you like to do?",
    options: [...MENU.map(({ label, value }) => ({ label, value })), { label: "Show command help", value: "help" }],
  });

  const choice = MENU.find((entry) => entry.value === action);
  if (!choice) return false;
  await choice.run(options);
  return true;
}
