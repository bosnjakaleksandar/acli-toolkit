import { confirm, note, select, text } from "@clack/prompts";
import YAML from "yaml";
import type { Command } from "commander";
import { ask } from "../../ui/prompts.ts";
import { loadConfig } from "../../config/ConfigLoader.ts";
import { clearDefaultProfile, deleteProfile, setDefaultProfile, setProfileGitSshHostAlias } from "../../profiles/ProfileStore.ts";
import { createProfileCommand } from "../../profiles/ProfileBuilder.ts";
import { describeProfile, getCurrentProfile, inspectProfile, listProfiles, validateNamedProfile } from "../../profiles/ProfileQuery.ts";
import { PROVIDER_NAMES } from "../../providers/registry.ts";
import type { ProfileCommandOptions } from "../options.ts";

export const PROFILE_MENU_OPTIONS = [
  { label: "Create a profile", value: "create" },
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
    const rows = await listProfiles({ config: options.config });
    if (action === "list") {
      note(rows.length
        ? rows.map((row) => `${row.default ? "* " : "  "}${row.name}${row.default ? " (default)" : ""} — ${row.description}`).join("\n")
        : "No profiles found. Create one before importing.", "Staging profiles");
      continue;
    }
    if (!rows.length) {
      note("No profiles found. Create a profile first.", "Profiles");
      continue;
    }

    const selected = await ask(select, {
      message: action === "delete" ? "Choose a profile to delete:" : action === "git-alias" ? "Choose a profile to configure:" : "Choose the default staging profile:",
      options: rows.map((row) => ({ label: `${row.name} — ${row.description}`, value: row.name })),
    }) as string;
    if (action === "delete") {
      if (!(await ask(confirm, { message: `Delete profile "${selected}"?`, initialValue: false }))) continue;
      const file = await deleteProfile(selected, { configPath: options.config });
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
      const file = await setProfileGitSshHostAlias(selected, alias || null, { configPath: options.config });
      note(alias ? `Git SSH alias for "${selected}" is now "${alias}".\n${file}` : `Git SSH alias cleared for "${selected}".\n${file}`, "Profile updated");
      continue;
    }

    const file = await setDefaultProfile(selected, { configPath: options.config });
    note(`Default profile is now "${selected}".\n${file}`, "Profile updated");
  }
}

export function registerProfileCommand(program: Command): void {
  const command = program.command("profile").description("Create and manage staging profiles (stored in your user config)");
  command.command("create [name]").description("Create a WordPress staging profile")
    .option("--provider <provider>", `How A-CLI reaches the server: ${PROVIDER_NAMES.join(" or ")}`)
    .option("--config <path>").option("--host <host>").option("--port <port>").option("--username <username>", "SSH username (may use {projectName})")
    .option("--identity-file <path>").option("--host-key-policy <policy>")
    .option("--project-root <path>", "ssh: remote project root").option("--wordpress-root <path>", "ssh: WordPress root relative to the project root").option("--directories <list>", "ssh: wp-content directories to sync")
    .option("--staging-url <url>").option("--git", "Link the site's Git repository").option("--no-git", "Do not link the Git repository").option("--git-ssh-host-alias <alias>", "Local ~/.ssh/config Host alias for fetched Git remotes")
    .option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
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
  command.command("use [name]").description("Choose the default staging profile").option("--config <path>").option("--clear", "Clear the default profile").action(async (name: string | undefined, options: ProfileCommandOptions) => {
    if (options.clear) { const file = await clearDefaultProfile({ configPath: options.config }); console.log(`Default profile cleared in ${file}.`); return; }
    const { config } = await loadConfig({ configPath: options.config });
    const names = Object.keys(config.profiles || {});
    if (!names.length) throw new Error("No profiles exist. Run `acli profile create` first.");
    const selected = name || (await ask(select, { message: "Choose the default staging profile:", options: names.map((item) => ({ label: `${item} — ${describeProfile(config.profiles![item])}`, value: item })) }) as string);
    const file = await setDefaultProfile(selected, { configPath: options.config });
    console.log(`Default profile is now "${selected}" (${file}).`);
  });
  command.command("git-alias <name> [alias]").description("Set the local ~/.ssh/config Host alias used to fetch a profile's Git origin")
    .option("--config <path>").option("--clear", "Clear the configured alias")
    .action(async (name: string, alias: string | undefined, options: ProfileCommandOptions) => {
      if (!options.clear && !alias) throw new Error("Git SSH host alias is required, or pass --clear.");
      const file = await setProfileGitSshHostAlias(name, options.clear ? null : alias!, { configPath: options.config });
      console.log(options.clear ? `Git SSH alias cleared for profile "${name}" (${file}).` : `Git SSH alias for profile "${name}" is now "${alias}" (${file}).`);
    });
  command.command("inspect <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    console.log(YAML.stringify(await inspectProfile(name, { config: options.config })));
  });
  command.command("validate <name>").option("--config <path>").action(async (name: string, options: ProfileCommandOptions) => {
    await validateNamedProfile(name, { config: options.config });
    console.log(`Profile "${name}" is valid.`);
  });
  command.command("delete <name>").option("--config <path>").option("--yes", "Delete without confirmation").option("--force", "Clear references to this profile while deleting").action(async (name: string, options: ProfileCommandOptions) => {
    if (!options.yes && !(await ask(confirm, { message: `Delete profile "${name}"?`, initialValue: false }))) return;
    const file = await deleteProfile(name, { configPath: options.config, force: options.force });
    console.log(`Profile "${name}" deleted from ${file}.`);
  });
}
