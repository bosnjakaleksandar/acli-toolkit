import path from "node:path";
import YAML from "yaml";
import type { Command } from "commander";
import { getProjectConfigPath, getUserConfigPath, loadConfig, redactSecrets } from "../services/ConfigService.ts";

export function registerConfigCommand(program: Command): void {
  const command = program.command("config").description("Inspect and validate A-CLI configuration");
  command.command("path").description("Print configuration search paths").action(() => {
    console.log(`User: ${getUserConfigPath()}\nProject: ${getProjectConfigPath()}`);
  });
  command.command("show").option("--resolved", "Resolve layered configuration and secret references").option("--config <path>", "Use an explicit configuration file").action(async (options: any) => {
    const result = await loadConfig({ configPath: options.config, resolveSecrets: Boolean(options.resolved) });
    console.log(YAML.stringify(redactSecrets(options.resolved ? result.config : result.rawConfig)));
  });
  command.command("validate").option("--config <path>", "Use an explicit configuration file").action(async (options: any) => {
    const result = await loadConfig({ configPath: options.config, resolveSecrets: false });
    console.log(`Configuration is valid (${result.sources.map((source) => path.basename(source.name)).join(", ")}).`);
  });
}
