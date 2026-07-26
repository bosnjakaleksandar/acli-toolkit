import YAML from "yaml";
import type { Command } from "commander";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { loadPreset } from "../../projects/plan/presets.ts";
import type { PresetCommandOptions } from "../options.ts";

export function registerPresetCommand(program: Command): void {
  const command = program.command("preset").description("List and inspect project presets");
  command.command("list").option("--config <path>").option("--json", "Output machine-readable JSON").action(async (options: PresetCommandOptions) => {
    const { config } = await loadConfig({ configPath: options.config, resolveSecrets: false });
    const rows = Object.entries(config.presets || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, preset]) => ({ name, type: preset.projectType || preset.appType || "unknown", environment: preset.environment || "default" }));
    if (options.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (!rows.length) { console.log("No presets found."); return; }
    console.log(formatTable(["NAME", "TYPE", "ENVIRONMENT"], rows.map((row) => [row.name, row.type, row.environment])));
  });
  command.command("inspect <name>").option("--config <path>").action(async (name: string, options: PresetCommandOptions) => {
    const { config } = await loadConfig({ configPath: options.config, resolveSecrets: false });
    console.log(YAML.stringify(await loadPreset(name, config)));
  });
}

function formatTable(headers: string[], rows: unknown[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)));
  return [headers, ...rows].map((row) => row.map((cell, index) => String(cell).padEnd(widths[index]!)).join("  ").trimEnd()).join("\n");
}
