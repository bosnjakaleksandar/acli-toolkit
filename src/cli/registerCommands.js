import { registerCreateCommand } from "../commands/createProject.js";
import { registerImportCommand } from "../commands/import.js";
import { registerDoctorCommand } from "../commands/doctor.js";
import { registerUpdateCommand } from "../commands/update.js";
import { registerConfigCommand } from "../commands/config.js";
import { registerPresetCommand } from "../commands/preset.js";
import { registerProfileCommand } from "../commands/profile.js";
import { registerLinkCommand } from "../commands/link.js";
import { registerPullCommand } from "../commands/pull.js";

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
