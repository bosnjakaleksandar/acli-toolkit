import { isObject } from "../../core/objects.ts";
import { CoolifyProjectHost } from "./CoolifyProjectHost.ts";
import { askSelectionMenu } from "./prompts.ts";
import type { ProviderDefinition } from "../contract.ts";

// Server project names may contain spaces ("acme client site"); the value is
// always shell-quoted before it reaches the remote `project` CLI.
export const COOLIFY_PROJECT_PATTERN = /^[A-Za-z0-9{][A-Za-z0-9 {}._-]*$/;
const HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const COOLIFY_KEYS = new Set(["project", "gitHost", "database", "databaseName", "wordpressContainer"]);
const SELECTION_KEYS = ["database", "databaseName", "wordpressContainer"] as const;

// The WordPress install lives inside a Coolify-managed container that A-CLI
// never touches directly; this is the container path the server-side
// `project` CLI exports from, kept only so plans/summaries have a value.
const WORDPRESS_ROOT = "/var/www/html";

/** A Coolify staging server that exposes only the `project` CLI. */
export const coolifyProvider: ProviderDefinition = {
  name: "coolify-cli",
  profileKeys: ["coolify"],

  validate(profile, label, errors) {
    const coolify = profile.coolify as unknown;
    if (!isObject(coolify)) { errors.push(`${label}: coolify.project is required for provider: coolify-cli.`); return; }
    for (const key of Object.keys(coolify)) if (!COOLIFY_KEYS.has(key)) errors.push(`${label}: unknown field "coolify.${key}".`);
    if (typeof coolify.project !== "string" || !COOLIFY_PROJECT_PATTERN.test(coolify.project)) errors.push(`${label}: coolify.project must be a project name as printed by \`project list\` (letters, digits, spaces, . _ -).`);
    if (coolify.gitHost !== undefined && (typeof coolify.gitHost !== "string" || !HOSTNAME_PATTERN.test(coolify.gitHost))) errors.push(`${label}: coolify.gitHost must be a hostname, e.g. github.com.`);
    for (const key of SELECTION_KEYS) {
      if (coolify[key] !== undefined && (typeof coolify[key] !== "string" || !/^[A-Za-z0-9._-]+$/.test(coolify[key] as string))) errors.push(`${label}: coolify.${key} must be a name as printed in the server's selection menu.`);
    }
  },

  resolve(profile, render) {
    const project = render(profile.coolify?.project);
    if (!project || !COOLIFY_PROJECT_PATTERN.test(project)) throw new Error(`Unsafe value for profile field "coolify.project": ${JSON.stringify(project)}.`);
    const { database, databaseName, wordpressContainer } = profile.coolify || {};
    return {
      remote: { projectRoot: WORDPRESS_ROOT, wordpressRoot: WORDPRESS_ROOT },
      coolify: { project, gitHost: profile.coolify?.gitHost || "github.com", ...(database ? { database } : {}), ...(databaseName ? { databaseName } : {}), ...(wordpressContainer ? { wordpressContainer } : {}) },
    };
  },

  tools: () => ["ssh", "scp", "tar"],

  describe: (profile) => `Coolify project CLI · ${profile.coolify?.project || "unknown project"}`,

  summary: (profile) => [`Coolify project: ${profile.coolify?.project}`, "Database and files: exported with the server's project CLI (pull-only)"],

  plan(profile, ctx) {
    return {
      coolifyProject: profile.coolify!.project,
      databaseDriver: ctx.skipDatabase ? "skipped" : "project db-export",
      fileTransfer: ctx.skipFiles ? "skipped" : "project wp-export + scp",
    };
  },

  // Menu selections only answer the server's "which container/database?"
  // prompt; adding one to get past that prompt must not invalidate a
  // --resume of the files already fetched.
  fingerprint(profile) {
    if (!profile.coolify) return profile;
    const { database: _database, databaseName: _databaseName, wordpressContainer: _wordpressContainer, ...coolify } = profile.coolify;
    return { ...profile, coolify };
  },

  create: (profile, runner, { interactive = false }) => new CoolifyProjectHost(profile, runner, { chooseOption: interactive ? askSelectionMenu : null }),
};
