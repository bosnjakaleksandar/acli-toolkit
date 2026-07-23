import { confirm, multiselect, select, text } from "@clack/prompts";
import YAML from "yaml";
import type { Command } from "commander";
import { ask } from "../utils/prompts.ts";
import { loadConfig, redactSecrets, validateProfileConfig } from "../services/ConfigService.ts";
import { clearDefaultProfile, deleteProfile, saveProfile, setDefaultProfile } from "../services/ProfileService.ts";
import { getProfileTemplate, listProfileTemplates } from "../config/profileTemplates.ts";

export async function createProfileCommand(name: string | undefined, options: any = {}): Promise<{ name: string; profile: any; filePath: string }> {
  const nonInteractive = Boolean(options.yes);
  const template = options.template ? requireTemplate(options.template) : nonInteractive ? null : await maybeChooseTemplate();
  const d: any = template?.defaults || {};
  const profileName = name || (nonInteractive ? "" : await requiredText("Profile name:"));
  if (!profileName) throw new Error("Profile name is required.");
  const scope = options.config ? "explicit" : options.scope || (nonInteractive ? "project" : await ask(select, { message: "Where should the profile be saved?", options: [{ label: "Project (.acli/config.yaml)", value: "project" }, { label: "User (available everywhere)", value: "user" }] }));
  const value = async (option: unknown, message: string, initialValue = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? initialValue : requiredText(message, initialValue);
  const host = await value(options.host, "SSH host:", d.host ?? "");
  const port = Number(await value(options.port, "SSH port:", d.port ?? "22"));
  const username = await value(options.usernameTemplate, "SSH username or template:", d.usernameTemplate ?? "{projectName}");
  const identityFile = await value(options.identityFile, "SSH identity file or ${ENV_VAR} reference (optional):", d.identityFile ?? "");
  const hostKeyPolicy = options.hostKeyPolicy || (nonInteractive ? (d.hostKeyPolicy ?? "strict") : await ask(select, { message: "SSH host-key policy:", initialValue: d.hostKeyPolicy ?? "strict", options: [{ label: "Strict (Recommended)", value: "strict" }, { label: "Accept new hosts", value: "accept-new" }, { label: "Insecure", value: "insecure" }] }));
  const projectRoot = await value(options.projectRoot, "Remote project root:", d.projectRoot ?? "/srv/projects/{projectName}");
  const wordpressRoot = await value(options.wordpressRoot, "WordPress root relative to project root:", d.wordpressRoot ?? "wordpress");
  const transport = options.transport || (nonInteractive ? (d.transport ?? "rsync") : await ask(select, { message: "File transport:", initialValue: d.transport ?? "rsync", options: [{ label: "rsync (Recommended)", value: "rsync" }, { label: "SFTP/SCP", value: "sftp" }] }));
  const directories = options.directories ? splitList(options.directories) : nonInteractive ? (d.directories ?? ["uploads", "plugins", "themes"]) : await ask(multiselect, { message: "WordPress content directories:", options: [{ label: "Uploads", value: "uploads" }, { label: "Plugins", value: "plugins" }, { label: "Themes", value: "themes" }], initialValues: d.directories ?? ["uploads", "plugins", "themes"], required: true });
  const databaseDriver = options.databaseDriver || (nonInteractive ? (d.databaseDriver ?? "wp-cli") : await ask(select, { message: "Remote database driver:", initialValue: d.databaseDriver ?? "wp-cli", options: [{ label: "WP-CLI (Recommended)", value: "wp-cli" }, { label: "Docker Compose", value: "docker" }, { label: "Direct MySQL/MariaDB", value: "direct" }] }));
  const database = await buildDatabase(databaseDriver, options, nonInteractive, d);
  const stagingUrl = await value(options.stagingUrl, "Staging URL template:", d.stagingUrl ?? "https://{projectName}.staging.example.com");
  const localUrl = await value(options.localUrl, "Local URL (optional; environment default when empty):", d.localUrl ?? "");
  const gitEnabled = options.git === false ? false : options.git === true ? true : nonInteractive ? (d.git ?? true) : await ask(confirm, { message: "Discover and link the remote Git repository?", initialValue: d.git ?? true });
  if (!host || !username || !projectRoot || !wordpressRoot || !stagingUrl) throw new Error("Host, username, project root, WordPress root, and staging URL are required.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH port must be between 1 and 65535.");
  const profile = {
    type: "wordpress",
    ssh: compact({ host, port, username, identityFile, hostKeyPolicy }),
    remote: { projectRoot, wordpressRoot },
    files: { transport, directories, excludes: ["*.log", "node_modules"] },
    database,
    git: { enabled: gitEnabled, ...(gitEnabled ? { discoveryPaths: [".", "wp-content/themes/{projectName}"] } : {}) },
    urls: { staging: stagingUrl },
    ...(localUrl ? { local: { url: localUrl } } : {}),
  };
  const filePath = await saveProfile(profileName, profile as any, { scope: scope === "explicit" ? "project" : scope, configPath: options.config, force: options.force });
  console.log(`Profile "${profileName}" saved to ${filePath}.`);
  return { name: profileName, profile, filePath };
}

/**
 * Reproduces the pre-A-CLI `create-project` staging convention as a profile:
 * SSH username equal to the project name, remote layout `~/<project>/wordpress`,
 * a Docker container discovered by name, and a staging URL of
 * `https://<project><STAGING_SUFFIX>`. Converts every legacy user's setup
 * with one command instead of hand-authoring the equivalent YAML.
 */
export async function importLegacyProfileCommand(name: string | undefined, options: any = {}): Promise<{ name: string; profile: any; filePath: string }> {
  const nonInteractive = Boolean(options.yes);
  const profileName = name || (nonInteractive ? "" : await requiredText("Profile name:"));
  if (!profileName) throw new Error("Profile name is required.");

  const host = options.host || process.env.STAGING_SSH_HOST || (nonInteractive ? "" : await requiredText("STAGING_SSH_HOST value (from the legacy tool's .env):"));
  if (!host) throw new Error("STAGING_SSH_HOST is required. Pass --host or set the STAGING_SSH_HOST environment variable (as the legacy create-project tool did).");
  const suffix = options.suffix || process.env.STAGING_SUFFIX || ".staging";
  const identityFile = options.identityFile ?? "";
  const scope = options.config ? "explicit" : options.scope || (nonInteractive ? "project" : await ask(select, { message: "Where should the profile be saved?", options: [{ label: "Project (.acli/config.yaml)", value: "project" }, { label: "User (available everywhere)", value: "user" }] }));

  const profile = {
    type: "wordpress",
    ssh: compact({ host, username: "{projectName}", identityFile, hostKeyPolicy: "insecure" }),
    remote: { projectRoot: "{projectName}", wordpressRoot: "wordpress" },
    files: { transport: "rsync", directories: ["uploads", "plugins", "themes"], excludes: ["*.log", "node_modules"] },
    database: { driver: "docker", discovery: "container-name", containerPattern: "{projectName}", executable: "auto", envFile: ".env", userEnv: "DB_USER", passwordEnv: "DB_PASSWORD", nameEnv: "DB_NAME" },
    git: { enabled: true, includeProjectRoot: true, discoveryPaths: [".", "wp-content/themes/{projectName}"] },
    urls: { staging: `https://{projectName}${suffix}`, additionalSearchReplace: [`http://{projectName}${suffix}`] },
  };

  const filePath = await saveProfile(profileName, profile as any, { scope: scope === "explicit" ? "project" : scope, configPath: options.config, force: options.force });
  console.log(`Profile "${profileName}" saved to ${filePath}.`);
  console.log(`This reproduces the legacy convention: SSH username = project name, remote path ~/<project>/wordpress, Docker container discovered by name.`);
  console.log(`Note: hostKeyPolicy is set to "insecure" to match the legacy tool's behavior exactly. Once you've verified the connection, consider tightening it — edit the profile or rerun "acli profile create --host ${host} ..." with a stricter policy.`);
  return { name: profileName, profile, filePath };
}

async function maybeChooseTemplate(): Promise<ReturnType<typeof getProfileTemplate>> {
  const useTemplate = await ask(confirm, { message: "Start from a built-in template?", initialValue: true });
  if (!useTemplate) return null;
  const templates = listProfileTemplates();
  const choice = await ask(select, { message: "Choose a template:", options: templates.map((t) => ({ label: `${t.label} — ${t.description}`, value: t.name })) });
  return getProfileTemplate(choice as string);
}

function requireTemplate(name: string): NonNullable<ReturnType<typeof getProfileTemplate>> {
  const template = getProfileTemplate(name);
  if (!template) throw new Error(`Unknown profile template "${name}". Available: ${listProfileTemplates().map((t) => t.name).join(", ")}.`);
  return template;
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
    .option("--git", "Enable Git discovery").option("--no-git", "Disable Git discovery").option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: any) => { await createProfileCommand(name, options); });
  command.command("list").option("--config <path>").option("--json", "Output machine-readable JSON").action(async (options: any) => { const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const current = rawConfig.defaults?.profile; const rows = Object.keys(rawConfig.profiles || {}).sort().map((name) => ({ name, default: name === current, description: describeProfile(rawConfig.profiles![name]) })); if (options.json) { console.log(JSON.stringify(rows, null, 2)); return; } if (!rows.length) { console.log("No profiles found. Run `acli profile create` to add one."); return; } for (const row of rows) console.log(`${row.default ? "*" : " "} ${row.name}${row.default ? " (default)" : ""} — ${row.description}`); });
  command.command("current").option("--config <path>").action(async (options: any) => { const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const name = rawConfig.defaults?.profile; if (!name) { console.log("No default profile is selected. A-CLI will ask during existing WordPress setup."); return; } const profile = rawConfig.profiles?.[name as string]; console.log(`${name}${profile ? ` — ${describeProfile(profile)}` : " (referenced but not found)"}`); });
  command.command("use [name]").description("Choose the default staging profile").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--clear", "Clear the default profile").action(async (name: string | undefined, options: any) => { if (options.clear) { const file = await clearDefaultProfile({ scope: options.scope, configPath: options.config }); console.log(`Default profile cleared in ${file}.`); return; } const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const names = Object.keys(rawConfig.profiles || {}); if (!names.length) throw new Error("No profiles exist. Run `acli profile create` first."); const selected = name || (await ask(select, { message: "Choose the default staging profile:", options: names.map((item) => ({ label: `${item} — ${describeProfile(rawConfig.profiles![item])}`, value: item })) }) as string); if (!rawConfig.profiles?.[selected]) throw new Error(`Profile "${selected}" was not found.`); const file = await setDefaultProfile(selected, { scope: options.scope, configPath: options.config, allowExternal: true }); console.log(`Default profile is now "${selected}" (${file}).`); });
  command.command("inspect <name>").option("--config <path>").action(async (name: string, options: any) => { const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const profile = rawConfig.profiles?.[name]; if (!profile) throw new Error(`Profile "${name}" was not found.`); console.log(YAML.stringify(redactSecrets(profile))); });
  command.command("validate <name>").option("--config <path>").action(async (name: string, options: any) => { const { rawConfig } = await loadConfig({ configPath: options.config, resolveSecrets: false }); const profile = rawConfig.profiles?.[name]; if (!profile) throw new Error(`Profile "${name}" was not found.`); validateProfileConfig(profile, `profile "${name}"`); console.log(`Profile "${name}" is valid.`); });
  command.command("delete <name>").option("--scope <scope>", "Storage scope: project or user", "project").option("--config <path>").option("--yes", "Delete without confirmation").action(async (name: string, options: any) => { if (!options.yes && !(await ask(confirm, { message: `Delete profile "${name}"?`, initialValue: false }))) return; const file = await deleteProfile(name, { scope: options.scope, configPath: options.config }); console.log(`Profile "${name}" deleted from ${file}.`); });
  command.command("templates").description("List built-in profile templates").action(() => { for (const t of listProfileTemplates()) console.log(`${t.name} — ${t.label}\n  ${t.description}`); });
  command.command("import-legacy [name]").description("Reproduce the legacy create-project staging convention (STAGING_SSH_HOST/STAGING_SUFFIX) as a profile")
    .option("--host <host>", "SSH host (defaults to $STAGING_SSH_HOST)")
    .option("--suffix <suffix>", "Staging URL suffix (defaults to $STAGING_SUFFIX or .staging)")
    .option("--identity-file <reference>", "SSH identity file or ${ENV_VAR} reference (optional)")
    .option("--scope <scope>", "Storage scope: project or user").option("--config <path>")
    .option("--force", "Replace an existing profile").option("--yes", "Do not prompt")
    .action(async (name: string | undefined, options: any) => { await importLegacyProfileCommand(name, options); });
}

async function buildDatabase(driver: string, options: any, nonInteractive: boolean, d: any = {}): Promise<any> {
  if (driver === "wp-cli") return { driver };
  if (driver === "docker") return { driver, service: options.dbService || d.dbService || "db", executable: "mariadb-dump", userEnv: "MYSQL_USER", passwordEnv: "MYSQL_PASSWORD", nameEnv: "MYSQL_DATABASE" };
  const read = async (option: unknown, message: string, fallback = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? fallback : requiredText(message, fallback);
  const database = { driver, host: await read(options.dbHost, "Database host:", d.dbHost ?? "127.0.0.1"), port: Number(await read(options.dbPort, "Database port:", d.dbPort ?? "3306")), user: await read(options.dbUser, "Database user or ${ENV_VAR} reference:", d.dbUser ?? ""), password: await read(options.dbPassword, "Database password ${ENV_VAR} reference:", d.dbPassword ?? ""), name: await read(options.dbName, "Database name or ${ENV_VAR} reference:", d.dbName ?? "") };
  if (!database.user || !database.password || !database.name) throw new Error("Direct database profiles require user, password, and database name references.");
  return database;
}

function requiredText(message: string, initialValue = ""): Promise<string> { return ask(text, { message, initialValue, validate: (value: string | undefined) => value?.trim() ? undefined : "A value is required." }); }
function splitList(value: unknown): string[] { return Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function compact(object: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== undefined)); }
function describeProfile(profile: any): string { return `${profile.ssh?.host || "unknown host"} · ${profile.database?.executable === "auto" ? "MariaDB/MySQL" : profile.database?.driver || "unknown DB"} · ${profile.files?.transport || "rsync"}`; }
