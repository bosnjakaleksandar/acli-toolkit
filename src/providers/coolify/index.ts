import { isObject, REMOTE_PROJECT_PATTERN } from "../../core/objects.ts";
import { CoolifyProjectHost, projectSlug } from "./CoolifyProjectHost.ts";
import { askSelectionMenu } from "./prompts.ts";
import type { ProviderDefinition } from "../contract.ts";

const HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const COOLIFY_KEYS = new Set(["gitHost"]);
// Fields that moved out of the profile in 3.0: which project is chosen at
// import, and prompt answers are remembered per project in its link.
const MOVED_KEYS = new Set(["project", "database", "databaseName", "wordpressContainer"]);

/** A Coolify staging server that exposes only the `project` CLI. */
export const coolifyProvider: ProviderDefinition = {
  name: "coolify-cli",
  profileKeys: ["coolify"],

  validate(profile, label, errors) {
    const coolify = profile.coolify as unknown;
    if (coolify === undefined) return;
    if (!isObject(coolify)) { errors.push(`${label}: coolify must be a mapping.`); return; }
    for (const key of Object.keys(coolify)) {
      if (MOVED_KEYS.has(key)) errors.push(`${label}: coolify.${key} is no longer part of a profile — a profile describes the server; the project is chosen with \`acli import [project]\` and prompt answers are remembered in the project's .acli/config.yaml. Remove the field.`);
      else if (!COOLIFY_KEYS.has(key)) errors.push(`${label}: unknown field "coolify.${key}".`);
    }
    if (coolify.gitHost !== undefined && (typeof coolify.gitHost !== "string" || !HOSTNAME_PATTERN.test(coolify.gitHost))) errors.push(`${label}: coolify.gitHost must be a hostname, e.g. github.com.`);
  },

  resolve(profile, _render, target) {
    const project = target.remoteProject || target.projectName;
    if (!project || !REMOTE_PROJECT_PATTERN.test(project)) throw new Error(`Unsafe server project name: ${JSON.stringify(project)}.`);
    const { database, databaseName, wordpressContainer } = target.selections || {};
    return {
      coolify: { project, gitHost: profile.coolify?.gitHost || "github.com", ...(database ? { database } : {}), ...(databaseName ? { databaseName } : {}), ...(wordpressContainer ? { wordpressContainer } : {}) },
    };
  },

  describe: () => "Coolify project CLI",

  summary: () => ["Database and files: exported with the server's project CLI (pull-only)"],

  plan(profile, ctx) {
    return {
      coolifyProject: profile.coolify!.project,
      databaseDriver: ctx.skipDatabase ? "skipped" : "project db-export",
      fileTransfer: ctx.skipFiles ? "skipped" : "project wp-export + scp",
    };
  },

  // Menu selections only answer the server's "which container/database?"
  // prompt, so they don't count; the project counts by its slug, so resuming
  // "Acme Site" as "acme-site" is the same run.
  fingerprint(profile) {
    if (!profile.coolify) return profile;
    const { database: _database, databaseName: _databaseName, wordpressContainer: _wordpressContainer, project, ...coolify } = profile.coolify;
    return { ...profile, coolify: { ...coolify, project: projectSlug(project) } };
  },

  create: (profile, runner, { interactive = false, onSelection, knownProjects }) => new CoolifyProjectHost(profile, runner, { chooseOption: interactive ? askSelectionMenu : null, ...(onSelection ? { onSelection } : {}), ...(knownProjects ? { knownProjects } : {}) }),
};
