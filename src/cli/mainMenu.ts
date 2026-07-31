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
import { runProfilesMenu } from "./commands/profile.ts";

/** Entries in the bare-`acli` menu, paired with the handler each one runs. */
export const MAIN_MENU: Array<{ label: string; value: string; run: (options: any) => Promise<void>; returnToMenu?: boolean }> = [
  { label: "Create a project", value: "create", run: (options) => createProjectCommand(options) },
  { label: "Import an existing WordPress site", value: "import", run: (options) => importCommand(options) },
  { label: "Profiles", value: "profiles", run: (options) => runProfilesMenu(options), returnToMenu: true },
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
      "No configuration found yet — that's normal for a first run.\nChoose Profiles to create a staging profile before importing,\nor choose Create to scaffold a new project.",
      "Get started",
    );
  }

  while (true) {
    const action = await ask(select, {
      message: "What would you like to do?",
      options: [...MAIN_MENU.map(({ label, value }) => ({ label, value })), { label: "Show command help", value: "help" }],
    });

    const choice = MAIN_MENU.find((entry) => entry.value === action);
    if (!choice) return false;
    await choice.run(options);
    if (!choice.returnToMenu) return true;
  }
}
