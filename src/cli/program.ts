import type { Command } from "commander";
import { registerCreateCommand } from "./commands/create.ts";
import { registerImportCommand } from "./commands/import.ts";
import { registerDoctorCommand } from "./commands/doctor.ts";
import { registerUpdateCommand } from "./commands/update.ts";
import { registerConfigCommand } from "./commands/config.ts";
import { registerPresetCommand } from "./commands/preset.ts";
import { registerProfileCommand } from "./commands/profile.ts";
import { registerLinkCommand } from "./commands/link.ts";
import { registerPullCommand } from "./commands/pull.ts";
import type { PackageMetadata } from "../system/packageMetadata.ts";

/** What every command registrar is handed. Only `update` reads it today, but it is the one place run-wide facts belong. */
export interface CommandContext {
  packageMetadata: PackageMetadata;
}

const commandRegistrars: Array<(program: Command, context: CommandContext) => void> = [
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

export function registerCommands(program: Command, context: CommandContext): void {
  for (const registerCommand of commandRegistrars) {
    registerCommand(program, context);
  }
}
