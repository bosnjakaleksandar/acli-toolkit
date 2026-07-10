import { registerCreateCommand } from "../commands/createProject.js";
import { registerDoctorCommand } from "../commands/doctor.js";
import { registerUpdateCommand } from "../commands/update.js";

const commandRegistrars = [
  registerCreateCommand,
  registerDoctorCommand,
  registerUpdateCommand,
];

export function registerCommands(program, context) {
  for (const registerCommand of commandRegistrars) {
    registerCommand(program, context);
  }
}
