import path from "node:path";
import fs from "fs-extra";
import { confirm, select } from "@clack/prompts";
import YAML from "yaml";
import type { Command } from "commander";
import { ask } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { clearDefaultProfile, deleteProfile, renameProfile, saveProfile, setDefaultProfile } from "../../profiles/ProfileStore.ts";
import { listProfileTemplates } from "../../profiles/templates.ts";
import { createProfileCommand, importLegacyProfileCommand } from "../../profiles/ProfileBuilder.ts";
import { describeProfile, exportProfile, getCurrentProfile, inspectProfile, listProfiles, readImportableProfile, validateNamedProfile } from "../../profiles/ProfileQuery.ts";
import type { ProfileCommandOptions } from "../options.ts";

export function registerProfileCommand(program: Command): void {
  const command = program.command("profile").description("Create and manage staging profiles");
  command.command("create [name]").description("Create a WordPress staging profile")
    .option("--template <name>", "Start from a built-in template: shared-host, docker-staging, or direct-database")
    .option("--scope <scope>", "Storage scope: project or user").option("--config <path>").option("--host <host>").option("--port <port>")
    .option("--username-template <template>").option("--identity-file <reference>").option("--host-key-policy <policy>")
    .option("--project-root <path>").option("--wordpress-root <path>").option("--transport <transport>").option("--directories <list>")
    .option("--database-driver <driver>").option("--db-service <service>").option("--db-host <host>").option("--db-port <port>")
    .option("--db-user <value>").option("--db-password <value>").option("--db-name <value>").option("--staging-url <url>").option("--local-url <url>")
    .option("--git", "Enable Git discovery").option("--no-git", "Disable Git discovery").option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: ProfileCommandOptions) => { await createProfileCommand(name, options); });
  command.command("list").option("--config <path>").option("--json", "Output machine-readable JSON").action(async (options: ProfileCommandOptions) => {
    const rows = await listProfiles({ config: options.config });
    if (options.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (!rows.length) { console.log("No profiles found. Run `acli profile create` to add one."); return; }
    for (const row of rows) console.log(`${row.default ? "*" : " "} ${row.name}${row.default ? " (default)" : ""} — ${row.description}`);
  });
  command.command("current").option("--config <path>").action(async (options: ProfileCommandOptions) => {
    const current = await getCurrentProfile({ config: options.config });
    if (!current.name) { console.log("No default profile is selected. A-CLI will ask during existing WordPress setup."); return; }
    console.log(`${current.name}${current.missing ? " (referenced but not found)" : ` — ${current.description}`}`);
  });
  command.command("use [name]").description("Choose the default staging profile").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--clear", "Clear the default profile").action(async (name: string | undefined, options: ProfileCommandOptions) => { if (options.clear) { const file = await clearDefaultProfile({ scope: options.scope, configPath: options.config }); console.log(`Default profile cleared in ${file}.`); return; } const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const names = Object.keys(rawConfig.profiles || {}); if (!names.length) throw new Error("No profiles exist. Run `acli profile create` first."); const selected = name || (await ask(select, { message: "Choose the default staging profile:", options: names.map((item) => ({ label: `${item} — ${describeProfile(rawConfig.profiles![item])}`, value: item })) }) as string); if (!rawConfig.profiles?.[selected]) throw new Error(`Profile "${selected}" was not found.`); const file = await setDefaultProfile(selected, { scope: options.scope, configPath: options.config, allowExternal: true }); console.log(`Default profile is now "${selected}" (${file}).`); });
  command.command("inspect <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    console.log(YAML.stringify(await inspectProfile(name, { config: options.config })));
  });
  command.command("validate <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    await validateNamedProfile(name, { config: options.config });
    console.log(`Profile "${name}" is valid.`);
  });
  command.command("delete <name>").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--yes", "Delete without confirmation").action(async (name: string, options: ProfileCommandOptions) => { if (!options.yes && !(await ask(confirm, { message: `Delete profile "${name}"?`, initialValue: false }))) return; const file = await deleteProfile(name, { scope: options.scope, configPath: options.config }); console.log(`Profile "${name}" deleted from ${file}.`); });
  command.command("rename <oldName> <newName>").description("Rename a profile, updating the default profile and any preset that references it in the same file")
    .option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--force", "Replace an existing profile with the new name")
    .action(async (oldName: string, newName: string, options: ProfileCommandOptions) => { const file = await renameProfile(oldName, newName, { scope: options.scope, configPath: options.config, force: options.force }); console.log(`Profile "${oldName}" renamed to "${newName}" in ${file}.`); });
  command.command("export <name>").description("Print (or write) a profile as a portable YAML file, ready to share or use directly with --profile")
    .option("--output <path>", "Write to a file instead of printing to stdout").option("--config <path>")
    .action(async (name: string, options: ProfileCommandOptions) => {
      const { yaml, literalSecretPaths } = await exportProfile(name, { config: options.config });
      if (literalSecretPaths.length) console.error(`Warning: this profile has machine-specific value(s) at ${literalSecretPaths.join(", ")} — consider replacing with a \${ENV_VAR} reference (see docs/environment-variables.md) before sharing.`);
      if (!options.output) { console.log(yaml); return; }
      const outputPath = path.resolve(process.cwd(), options.output);
      // May contain literal secrets (see the warning above) — write it
      // private by default rather than at the default umask.
      await fs.writeFile(outputPath, yaml, { mode: 0o600 });
      console.log(`Profile "${name}" exported to ${outputPath}.`);
    });
  command.command("import <path> [name]").description("Save a portable profile YAML file (e.g. one produced by `profile export`) as a named profile")
    .option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--force", "Replace an existing profile with the same name")
    .action(async (filePath: string, name: string | undefined, options: ProfileCommandOptions) => {
      const { name: resolvedName, profile } = await readImportableProfile(filePath, name);
      const savedPath = await saveProfile(resolvedName, profile as any, { scope: options.scope, configPath: options.config, force: options.force });
      console.log(`Profile "${resolvedName}" imported to ${savedPath}.`);
    });
  command.command("templates").description("List built-in profile templates").action(() => { for (const t of listProfileTemplates()) console.log(`${t.name} — ${t.label}\n  ${t.description}`); });
  command.command("import-legacy [name]").description("Reproduce the legacy create-project staging convention (STAGING_SSH_HOST/STAGING_SUFFIX) as a profile")
    .option("--host <host>", "SSH host (defaults to $STAGING_SSH_HOST)")
    .option("--suffix <suffix>", "Staging URL suffix (defaults to $STAGING_SUFFIX or .staging)")
    .option("--identity-file <reference>", "SSH identity file or ${ENV_VAR} reference (optional)")
    .option("--scope <scope>", "Storage scope: project or user").option("--config <path>")
    .option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: ProfileCommandOptions) => { await importLegacyProfileCommand(name, options); });
}
