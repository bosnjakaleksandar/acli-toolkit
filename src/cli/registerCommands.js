import { registerCreateCommand } from "../commands/createProject.js";
import { registerImportCommand } from "../commands/import.js";
import { registerDoctorCommand } from "../commands/doctor.ts";
import { registerUpdateCommand } from "../commands/update.ts";
import { registerConfigCommand } from "../commands/config.ts";
import { registerPresetCommand } from "../commands/preset.ts";
import { registerProfileCommand } from "../commands/profile.ts";
import { registerLinkCommand } from "../commands/link.ts";
import { registerPullCommand } from "../commands/pull.ts";

const commandRegistrars = [
  registerCreateCommand,
  registerImportCommand,
  registerDoctorCommand,
  registerUpdateCommand,
  registerConfigCommand,
  registerPresetCommand,
  registerProfileCommand,
  registerLinkCommand,
  registerPullCommand,
];

export function registerCommands(program, context) {
  for (const registerCommand of commandRegistrars) {
    registerCommand(program, context);
  }
}
