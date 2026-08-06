import path from "node:path";
import fs from "fs-extra";
import { confirm, note, select, text } from "@clack/prompts";
import YAML from "yaml";
import type { Command } from "commander";
import { ask } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { clearDefaultProfile, deleteProfile, renameProfile, saveProfile, setDefaultProfile, setProfileGitSshHostAlias } from "../../profiles/ProfileStore.ts";
import { listProfileTemplates } from "../../profiles/templates.ts";
import { createProfileCommand, importLegacyProfileCommand } from "../../profiles/ProfileBuilder.ts";
import { describeProfile, exportProfile, getCurrentProfile, inspectProfile, listProfiles, readImportableProfile, validateNamedProfile } from "../../profiles/ProfileQuery.ts";
import type { ProfileCommandOptions } from "../options.ts";

export const PROFILE_MENU_OPTIONS = [
  { label: "Create a profile", value: "create" },
  { label: "Import a profile", value: "import" },
  { label: "Export a profile", value: "export" },
  { label: "List profiles", value: "list" },
  { label: "Set the default profile", value: "use" },
  { label: "Configure a Git SSH alias", value: "git-alias" },
  { label: "Delete a profile", value: "delete" },
  { label: "Back to main menu", value: "back" },
] as const;

/** Interactive profile entry point used by the bare `acli` main menu. */
export async function runProfilesMenu(options: ProfileCommandOptions = {}): Promise<void> {
  while (true) {
    const action = await ask(select, {
      message: "Profiles",
      options: [...PROFILE_MENU_OPTIONS],
    });
    if (action === "back") return;
    if (action === "create") {
      await createProfileCommand(undefined, { config: options.config });
      continue;
    }
    if (action === "import") {
      const filePath = await ask(text, {
        message: "Portable profile YAML path:",
        validate: (value: string | undefined) => value?.trim() ? undefined : "Profile path is required.",
      });
      const requestedName = await ask(text, {
        message: "Saved profile name (leave empty to infer it):",
        initialValue: "",
      });
      const scope = await chooseProfileScope(options, "Where should the imported profile be saved?");
      const { name, profile } = await readImportableProfile(filePath, requestedName || undefined);
      const savedPath = await saveProfile(name, profile as any, { scope, configPath: options.config });
      note(`Profile "${name}" imported.\n${savedPath}`, "Profile imported");
      continue;
    }

    const rows = await listProfiles({ config: options.config });
    if (action === "list") {
      note(rows.length
        ? rows.map((row) => `${row.default ? "* " : "  "}${row.name}${row.default ? " (default)" : ""} — ${row.description}`).join("\n")
        : "No profiles found. Create one before importing.", "Staging profiles");
      continue;
    }
    if (!rows.length) {
      note("No profiles found. Create or import a profile first.", "Profiles");
      continue;
    }

    const selected = await ask(select, {
      message: action === "export" ? "Choose a profile to export:" : action === "delete" ? "Choose a profile to delete:" : action === "git-alias" ? "Choose a profile to configure:" : "Choose the default staging profile:",
      options: rows.map((row) => ({ label: `${row.name} — ${row.description}`, value: row.name })),
    }) as string;
    if (action === "export") {
      const output = await ask(text, {
        message: "Export file path:",
        initialValue: `${selected}.profile.yaml`,
        validate: (value: string | undefined) => value?.trim() ? undefined : "Export path is required.",
      });
      const outputPath = path.resolve(process.cwd(), output);
      if (await fs.pathExists(outputPath) && !(await ask(confirm, { message: `Replace ${outputPath}?`, initialValue: false }))) continue;
      const { yaml, literalSecretPaths } = await exportProfile(selected, { config: options.config });
      await fs.writeFile(outputPath, yaml, { mode: 0o600 });
      const warning = literalSecretPaths.length
        ? `\nWarning: review machine-specific value(s): ${literalSecretPaths.join(", ")}.`
        : "";
      note(`Profile "${selected}" exported to ${outputPath}.${warning}`, "Profile exported");
      continue;
    }
    if (action === "delete") {
      const scope = await chooseProfileScope(options, "Where is this profile stored?");
      if (!(await ask(confirm, { message: `Delete profile "${selected}"?`, initialValue: false }))) continue;
      const file = await deleteProfile(selected, { scope, configPath: options.config });
      note(`Profile "${selected}" deleted.\n${file}`, "Profile deleted");
      continue;
    }
    if (action === "git-alias") {
      const current = await inspectProfile(selected, { config: options.config }) as any;
      const alias = await ask(text, {
        message: "Local ~/.ssh/config Host alias (empty clears it):",
        initialValue: current.git?.sshHostAlias || "",
        validate: (value: string | undefined) => !value || /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) ? undefined : "Use a valid SSH Host alias.",
      });
      const scope = await chooseProfileScope(options, "Where is this profile stored?");
      const file = await setProfileGitSshHostAlias(selected, alias || null, { scope, configPath: options.config });
      note(alias ? `Git SSH alias for "${selected}" is now "${alias}".\n${file}` : `Git SSH alias cleared for "${selected}".\n${file}`, "Profile updated");
      continue;
    }

    const scope = await chooseProfileScope(options, "Where should this default be saved?");
    const file = await setDefaultProfile(selected, { scope, configPath: options.config, allowExternal: scope === "project" });
    note(`Default profile is now "${selected}".\n${file}`, "Profile updated");
  }
}

async function chooseProfileScope(options: ProfileCommandOptions, message: string): Promise<"project" | "user" | undefined> {
  if (options.config) return undefined;
  return await ask(select, {
    message,
    options: [
      { label: "Project (.acli/config.yaml)", value: "project" },
      { label: "User (available everywhere)", value: "user" },
    ],
  }) as "project" | "user";
}

export function registerProfileCommand(program: Command): void {
  const command = program.command("profile").description("Create and manage staging profiles");
  command.command("create [name]").description("Create a WordPress staging profile")
    .option("--template <name>", "Start from a built-in template: shared-host, docker-staging, or direct-database")
    .option("--scope <scope>", "Storage scope: project or user").option("--config <path>").option("--host <host>").option("--port <port>")
    .option("--username-template <template>").option("--identity-file <reference>").option("--host-key-policy <policy>")
    .option("--project-root <path>").option("--wordpress-root <path>").option("--transport <transport>").option("--directories <list>")
    .option("--database-driver <driver>").option("--db-service <service>").option("--db-host <host>").option("--db-port <port>")
    .option("--db-user <value>").option("--db-password <value>").option("--db-name <value>").option("--staging-url <url>").option("--local-url <url>")
    .option("--git", "Enable Git discovery").option("--no-git", "Disable Git discovery").option("--git-ssh-host-alias <alias>", "Local ~/.ssh/config Host alias for fetched Git remotes").option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: ProfileCommandOptions) => { await createProfileCommand(name, options); });
  command.command("list").option("--config <path>").option("--json", "Output machine-readable JSON").action(async (options: ProfileCommandOptions) => {
    const rows = await listProfiles({ config: options.config });
    if (options.json) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (!rows.length) { console.log("No profiles found. Run `acli profile create` to add one."); return; }
    for (const row of rows) console.log(`${row.default ? "*" : " "} ${row.name}${row.default ? " (default)" : ""} — ${row.description}`);
  });
  command.command("current").option("--config <path>").action(async (options: ProfileCommandOptions) => {
    const current = await getCurrentProfile({ config: options.config });
    if (!current.name) { console.log("No default profile is selected. Import will use the sole profile or ask when several exist."); return; }
    console.log(`${current.name}${current.missing ? " (referenced but not found)" : ` — ${current.description}`}`);
  });
  command.command("use [name]").description("Choose the default staging profile").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--clear", "Clear the default profile").action(async (name: string | undefined, options: ProfileCommandOptions) => { if (options.clear) { const file = await clearDefaultProfile({ scope: options.scope, configPath: options.config }); console.log(`Default profile cleared in ${file}.`); return; } const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const names = Object.keys(rawConfig.profiles || {}); if (!names.length) throw new Error("No profiles exist. Run `acli profile create` first."); const selected = name || (await ask(select, { message: "Choose the default staging profile:", options: names.map((item) => ({ label: `${item} — ${describeProfile(rawConfig.profiles![item])}`, value: item })) }) as string); if (!rawConfig.profiles?.[selected]) throw new Error(`Profile "${selected}" was not found.`); const file = await setDefaultProfile(selected, { scope: options.scope, configPath: options.config, allowExternal: true }); console.log(`Default profile is now "${selected}" (${file}).`); });
  command.command("git-alias <name> [alias]").description("Set the local ~/.ssh/config Host alias used to fetch a profile's Git origin")
    .option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--clear", "Clear the configured alias")
    .action(async (name: string, alias: string | undefined, options: ProfileCommandOptions) => {
      if (!options.clear && !alias) throw new Error("Git SSH host alias is required, or pass --clear.");
      const file = await setProfileGitSshHostAlias(name, options.clear ? null : alias!, { scope: options.scope, configPath: options.config });
      console.log(options.clear ? `Git SSH alias cleared for profile "${name}" (${file}).` : `Git SSH alias for profile "${name}" is now "${alias}" (${file}).`);
    });
  command.command("inspect <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    console.log(YAML.stringify(await inspectProfile(name, { config: options.config })));
  });
  command.command("validate <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    await validateNamedProfile(name, { config: options.config });
    console.log(`Profile "${name}" is valid.`);
  });
  command.command("delete <name>").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--yes", "Delete without confirmation").option("--force", "Clear references to this profile while deleting").action(async (name: string, options: ProfileCommandOptions) => { if (!options.yes && !(await ask(confirm, { message: `Delete profile "${name}"?`, initialValue: false }))) return; const file = await deleteProfile(name, { scope: options.scope, configPath: options.config, force: options.force }); console.log(`Profile "${name}" deleted from ${file}.`); });
  command.command("rename <oldName> <newName>").description("Rename a profile, updating defaults, presets, and the project link in the same file")
    .option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--force", "Replace an existing profile with the new name")
    .action(async (oldName: string, newName: string, options: ProfileCommandOptions) => { const file = await renameProfile(oldName, newName, { scope: options.scope, configPath: options.config, force: options.force }); console.log(`Profile "${oldName}" renamed to "${newName}" in ${file}.`); });
  command.command("export <name>").description("Print (or write) a portable profile YAML file, ready to share or import")
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
    .option("--git-ssh-host-alias <alias>", "Local ~/.ssh/config Host alias for fetched Git remotes")
    .option("--scope <scope>", "Storage scope: project or user").option("--config <path>")
    .option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: ProfileCommandOptions) => { await importLegacyProfileCommand(name, options); });
}
