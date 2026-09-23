import { confirm, multiselect, select, text } from "@clack/prompts";
import { ask, askRequiredText } from "../ui/prompts.ts";
import { saveProfile } from "./ProfileStore.ts";
import { PROVIDER_NAMES } from "../providers/registry.ts";

/** Every field `acli profile create` accepts, whether from a flag or a prompt. Declared here, in the domain that consumes them, so `cli/options.ts` depends on the profiles layer rather than the reverse. */
export interface ProfileBuilderOptions {
  config?: string;
  provider?: string;
  host?: string;
  port?: string;
  username?: string;
  identityFile?: string;
  hostKeyPolicy?: string;
  projectRoot?: string;
  wordpressRoot?: string;
  directories?: string;
  stagingUrl?: string;
  git?: boolean;
  gitSshHostAlias?: string;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  clear?: boolean;
}

/**
 * Builds a staging profile from prompts and flags, then saves it to the
 * user config. This lives in the profiles domain rather than with the
 * `acli profile` command because ProfileSelection also needs it — when a
 * workflow requires a profile and none exists, it offers to create one on
 * the spot.
 */
export async function createProfileCommand(name: string | undefined, options: ProfileBuilderOptions = {}): Promise<{ name: string; profile: any; filePath: string }> {
  const nonInteractive = Boolean(options.yes);
  const profileName = name || (nonInteractive ? "" : await askRequiredText("Profile name:"));
  if (!profileName) throw new Error("Profile name is required.");
  const provider = options.provider || (nonInteractive ? "ssh" : await ask(select, {
    message: "How does A-CLI reach this server?",
    options: [
      { label: "SSH with wp-cli", value: "ssh", hint: "rsync for files, wp-cli for the database" },
      { label: "Coolify project CLI", value: "coolify-cli", hint: "the server's `project` command exports files and database" },
    ],
  }) as string);
  if (!PROVIDER_NAMES.includes(provider)) throw new Error(`Unknown provider "${provider}". Expected one of: ${PROVIDER_NAMES.join(", ")}.`);
  const coolify = provider === "coolify-cli";

  const value = async (option: unknown, message: string, initialValue = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? initialValue : askRequiredText(message, initialValue);
  const optional = async (option: unknown, message: string, initialValue = ""): Promise<string> => option !== undefined ? (option as string) : nonInteractive ? initialValue : (await ask(text, { message, initialValue })) as string;

  const host = await value(options.host, "SSH host:");
  const port = Number(await value(options.port, "SSH port:", "22"));
  const username = await value(options.username, coolify ? "SSH username:" : "SSH username (may use {projectName}):", coolify ? "" : "{projectName}");
  const identityFile = await optional(options.identityFile, "SSH private key (optional, e.g. ~/.ssh/id_ed25519):");
  const hostKeyPolicy = options.hostKeyPolicy || (nonInteractive ? "strict" : await ask(select, { message: "SSH host-key policy:", initialValue: "strict", options: [{ label: "Strict (Recommended)", value: "strict" }, { label: "Accept new hosts", value: "accept-new" }, { label: "Insecure", value: "insecure" }] }));
  if (!host || !username) throw new Error("SSH host and username are required.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH port must be between 1 and 65535.");

  // A Coolify profile describes only the server: which project to import is
  // chosen from the server's list at `acli import`.
  let providerFields: Record<string, unknown> = {};
  if (!coolify) {
    const projectRoot = await value(options.projectRoot, "Remote project root:", "/srv/projects/{projectName}");
    const wordpressRoot = await value(options.wordpressRoot, "WordPress root relative to project root:", "wordpress");
    const directories = options.directories ? splitList(options.directories) : nonInteractive ? ["uploads", "plugins", "themes"] : await ask(multiselect, { message: "WordPress content directories:", options: [{ label: "Uploads", value: "uploads" }, { label: "Plugins", value: "plugins" }, { label: "Themes", value: "themes" }, { label: "Languages", value: "languages" }], initialValues: ["uploads", "plugins", "themes"], required: true });
    providerFields = { remote: { projectRoot, wordpressRoot }, files: { directories, excludes: ["*.log", "node_modules"] } };
  }

  const stagingUrl = await optional(options.stagingUrl, "Staging URL (optional, also replaced during import):");
  const gitEnabled = options.git === false ? false : options.git === true ? true : nonInteractive ? true : await ask(confirm, { message: "Link the site's Git repository after import?", initialValue: true });
  const gitSshHostAlias = gitEnabled ? await optional(options.gitSshHostAlias, "Local Git SSH Host alias (optional, e.g. github-work):") : "";

  const profile = {
    type: "wordpress",
    ...(coolify ? { provider } : {}),
    ssh: compact({ host, port, username, identityFile, hostKeyPolicy }),
    ...providerFields,
    git: compact({ enabled: gitEnabled, sshHostAlias: gitSshHostAlias }),
    ...(stagingUrl ? { urls: { staging: stagingUrl } } : {}),
  };
  const filePath = await saveProfile(profileName, profile as any, { configPath: options.config, force: options.force });
  console.log(`Profile "${profileName}" saved to ${filePath}.`);
  return { name: profileName, profile, filePath };
}

function splitList(value: unknown): string[] { return Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function compact(object: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== undefined)); }
