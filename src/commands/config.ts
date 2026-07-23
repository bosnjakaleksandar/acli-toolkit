import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import type { Command } from "commander";
import { getProjectConfigPath, getUserConfigPath, loadConfig, redactSecrets } from "../services/ConfigService.ts";
import { CONFIG_VERSION } from "../config/defaults.ts";

const STARTER_CONFIG_HEADER = `# A-CLI configuration
#
#   defaults:  shared field defaults for \`acli create\` (e.g. mysqlVersion, environment)
#   presets:   named, reusable create plans — see \`acli preset list\` / \`acli preset inspect <name>\`
#   profiles:  staging environments for \`acli import\` / \`acli pull\` — see \`acli profile create\`
#
# Reference secrets instead of storing them in plain text:
#   identityFile: "\${ACLI_SSH_KEY}"
#   password: { command: "op read op://vault/item/password" }
#
# Docs: \`acli config path\`, \`acli config show --resolved\`, \`acli config validate\`

`;

export function registerConfigCommand(program: Command): void {
  const command = program.command("config").description("Inspect and validate A-CLI configuration");
  command.command("path").description("Print configuration search paths").action(() => {
    console.log(`User: ${getUserConfigPath()}\nProject: ${getProjectConfigPath()}`);
  });
  command.command("init").description("Write a starter configuration file")
    .option("--scope <scope>", "Storage scope: user or project", "user")
    .option("--config <path>", "Write to an explicit path instead")
    .option("--force", "Overwrite an existing configuration file")
    .action(async (options: any) => {
      const filePath = options.config
        ? path.resolve(process.cwd(), options.config)
        : options.scope === "project"
          ? getProjectConfigPath()
          : getUserConfigPath();
      if (!options.force && (await fs.pathExists(filePath))) {
        console.log(`Configuration already exists at ${filePath}. Pass --force to overwrite.`);
        process.exitCode = 1;
        return;
      }
      const starter = { version: CONFIG_VERSION, defaults: {}, presets: {}, profiles: {} };
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, STARTER_CONFIG_HEADER + YAML.stringify(starter), { mode: 0o600 });
      console.log(`Configuration initialized at ${filePath}.`);
      console.log("Next: `acli profile create` to add a staging environment, or `acli create` to scaffold a project.");
    });
  command.command("show").option("--resolved", "Resolve layered configuration and secret references").option("--config <path>", "Use an explicit configuration file").action(async (options: any) => {
    const result = await loadConfig({ configPath: options.config, resolveSecrets: Boolean(options.resolved) });
    console.log(YAML.stringify(redactSecrets(options.resolved ? result.config : result.rawConfig)));
  });
  command.command("validate").option("--config <path>", "Use an explicit configuration file").action(async (options: any) => {
    const result = await loadConfig({ configPath: options.config, resolveSecrets: false });
    console.log(`Configuration is valid (${result.sources.map((source) => source.name).join(", ")}).`);
  });
}
