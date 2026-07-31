import { confirm, multiselect, select, text } from "@clack/prompts";
import { ask, askRequiredText } from "../ui/prompts.ts";
import { saveProfile } from "./ProfileStore.ts";
import { getProfileTemplate, listProfileTemplates } from "./templates.ts";

/** Every field `acli profile create` / `profile import-legacy` accept, whether from a flag or a prompt. Declared here, in the domain that consumes them, so `cli/options.ts` depends on the profiles layer rather than the reverse. */
export interface ProfileBuilderOptions {
  template?: string;
  scope?: "project" | "user";
  config?: string;
  host?: string;
  port?: string;
  usernameTemplate?: string;
  identityFile?: string;
  hostKeyPolicy?: string;
  projectRoot?: string;
  wordpressRoot?: string;
  transport?: string;
  directories?: string;
  databaseDriver?: string;
  dbService?: string;
  dbHost?: string;
  dbPort?: string;
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
  stagingUrl?: string;
  localUrl?: string;
  git?: boolean;
  gitSshHostAlias?: string;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  clear?: boolean;
  output?: string;
  suffix?: string;
}

/**
 * Builds a staging profile from prompts, flags and optional built-in
 * templates, then persists it. This lives in the profiles domain rather
 * than with the `acli profile` command because ProfileSelection also needs
 * it — when a workflow requires a profile and none exists, it offers to
 * create one on the spot. Keeping it here is what lets the profiles domain
 * do that without importing from the CLI layer.
 */
export async function createProfileCommand(name: string | undefined, options: ProfileBuilderOptions = {}): Promise<{ name: string; profile: any; filePath: string }> {
  const nonInteractive = Boolean(options.yes);
  const template = options.template ? requireTemplate(options.template) : nonInteractive ? null : await maybeChooseTemplate();
  const d: any = template?.defaults || {};
  const profileName = name || (nonInteractive ? "" : await askRequiredText("Profile name:"));
  if (!profileName) throw new Error("Profile name is required.");
  const scope = options.config ? "explicit" : options.scope || (nonInteractive ? "project" : await ask(select, { message: "Where should the profile be saved?", options: [{ label: "Project (.acli/config.yaml)", value: "project" }, { label: "User (available everywhere)", value: "user" }] }) as "project" | "user");
  const value = async (option: unknown, message: string, initialValue = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? initialValue : askRequiredText(message, initialValue);
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
  const gitSshHostAlias = gitEnabled
    ? await value(options.gitSshHostAlias, "Local Git SSH Host alias (optional, e.g. github-work):", d.gitSshHostAlias ?? "")
    : "";
  if (!host || !username || !projectRoot || !wordpressRoot || !stagingUrl) throw new Error("Host, username, project root, WordPress root, and staging URL are required.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH port must be between 1 and 65535.");
  const profile = {
    type: "wordpress",
    ssh: compact({ host, port, username, identityFile, hostKeyPolicy }),
    remote: { projectRoot, wordpressRoot },
    files: { transport, directories, excludes: ["*.log", "node_modules"] },
    database,
    git: compact({ enabled: gitEnabled, ...(gitEnabled ? { discoveryPaths: [".", "wp-content/themes/{projectName}"] } : {}), sshHostAlias: gitSshHostAlias }),
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
export async function importLegacyProfileCommand(name: string | undefined, options: ProfileBuilderOptions = {}): Promise<{ name: string; profile: any; filePath: string }> {
  const nonInteractive = Boolean(options.yes);
  const profileName = name || (nonInteractive ? "" : await askRequiredText("Profile name:"));
  if (!profileName) throw new Error("Profile name is required.");

  const host = options.host || process.env.STAGING_SSH_HOST || (nonInteractive ? "" : await askRequiredText("STAGING_SSH_HOST value (from the legacy tool's .env):"));
  if (!host) throw new Error("STAGING_SSH_HOST is required. Pass --host or set the STAGING_SSH_HOST environment variable (as the legacy create-project tool did).");
  const suffix = options.suffix || process.env.STAGING_SUFFIX || ".staging";
  const identityFile = options.identityFile ?? "";
  const scope = options.config ? "explicit" : options.scope || (nonInteractive ? "project" : await ask(select, { message: "Where should the profile be saved?", options: [{ label: "Project (.acli/config.yaml)", value: "project" }, { label: "User (available everywhere)", value: "user" }] }) as "project" | "user");

  const profile = {
    type: "wordpress",
    ssh: compact({ host, username: "{projectName}", identityFile, hostKeyPolicy: "insecure" }),
    remote: { projectRoot: "{projectName}", wordpressRoot: "wordpress" },
    files: { transport: "rsync", directories: ["uploads", "plugins", "themes"], excludes: ["*.log", "node_modules"] },
    database: { driver: "docker", discovery: "container-name", containerPattern: "{projectName}", executable: "auto", envFile: ".env", userEnv: "DB_USER", passwordEnv: "DB_PASSWORD", nameEnv: "DB_NAME" },
    git: compact({ enabled: true, includeProjectRoot: true, discoveryPaths: [".", "wp-content/themes/{projectName}"], sshHostAlias: options.gitSshHostAlias }),
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

async function buildDatabase(driver: string, options: ProfileBuilderOptions, nonInteractive: boolean, d: any = {}): Promise<any> {
  if (driver === "wp-cli") return { driver };
  if (driver === "docker") return { driver, service: options.dbService || d.dbService || "db", executable: "mariadb-dump", userEnv: "MYSQL_USER", passwordEnv: "MYSQL_PASSWORD", nameEnv: "MYSQL_DATABASE" };
  const read = async (option: unknown, message: string, fallback = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? fallback : askRequiredText(message, fallback);
  const database = { driver, host: await read(options.dbHost, "Database host:", d.dbHost ?? "127.0.0.1"), port: Number(await read(options.dbPort, "Database port:", d.dbPort ?? "3306")), user: await read(options.dbUser, "Database user or ${ENV_VAR} reference:", d.dbUser ?? ""), password: await read(options.dbPassword, "Database password ${ENV_VAR} reference:", d.dbPassword ?? ""), name: await read(options.dbName, "Database name or ${ENV_VAR} reference:", d.dbName ?? "") };
  if (!database.user || !database.password || !database.name) throw new Error("Direct database profiles require user, password, and database name references.");
  return database;
}

function splitList(value: unknown): string[] { return Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function compact(object: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== undefined)); }
