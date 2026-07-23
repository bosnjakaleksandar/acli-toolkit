import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import YAML from "yaml";
import { BUILT_IN_CONFIG, CONFIG_VERSION } from "../config/defaults.ts";
import { getProjectConfigPath, getUserConfigPath } from "../config/paths.ts";

const ROOT_KEYS = new Set(["version", "defaults", "presets", "profiles"]);
const PROJECT_ROOT_KEYS = new Set([...ROOT_KEYS, "project"]);
const PROFILE_KEYS = new Set(["type", "ssh", "remote", "files", "database", "git", "urls", "local"]);
const PROJECT_LINK_KEYS = new Set(["name", "type", "environment", "profile", "linkedAt"]);
const DB_DRIVERS = new Set(["wp-cli", "docker", "direct"]);
const FILE_TRANSPORTS = new Set(["rsync", "sftp"]);

export { getProjectConfigPath, getUserConfigPath };

export async function loadConfig({ cwd = process.cwd(), configPath, env = process.env, resolveSecrets = true } = {}) {
  const sources = [{ name: "built-in defaults", value: structuredClone(BUILT_IN_CONFIG) }];
  // Only the project-scoped file (or an explicit --config, which behaves like
  // one) may declare a `project:` link — the user-level config is shared
  // across every project on the machine, so a link there could never be
  // meaningful.
  const candidates = configPath
    ? [{ name: `explicit config (${path.resolve(cwd, configPath)})`, path: path.resolve(cwd, configPath), required: true, allowProjectKey: true }]
    : [
        { name: `user config (${getUserConfigPath()})`, path: getUserConfigPath(), allowProjectKey: false },
        { name: `project config (${getProjectConfigPath(cwd)})`, path: getProjectConfigPath(cwd), allowProjectKey: true },
      ];

  for (const candidate of candidates) {
    if (!(await fs.pathExists(candidate.path))) {
      if (candidate.required) throw new Error(`Configuration file not found: ${candidate.path}`);
      continue;
    }
    const value = await readConfigFile(candidate.path);
    validateConfig(value, candidate.name, { allowProjectKey: candidate.allowProjectKey });
    sources.push({ name: candidate.name, value });
  }

  const config = sources.reduce((result, source) => deepMerge(result, source.value), {});
  validateConfig(config, "resolved configuration", { allowProjectKey: true });
  const resolved = resolveSecrets ? resolveReferences(config, { env }) : config;
  return { config: resolved, rawConfig: config, sources };
}

export async function readConfigFile(filePath) {
  let parsed;
  try {
    parsed = YAML.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse configuration ${filePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Configuration ${filePath} must be an object.`);
  return parsed;
}

export function validateConfig(config, source = "configuration", { allowProjectKey = false } = {}) {
  const errors = [];
  if (config.version !== CONFIG_VERSION) errors.push(`${source}: top-level version must be ${CONFIG_VERSION}.`);
  const allowedRootKeys = allowProjectKey ? PROJECT_ROOT_KEYS : ROOT_KEYS;
  for (const key of Object.keys(config)) if (!allowedRootKeys.has(key)) errors.push(`${source}: unknown top-level field "${key}".`);
  for (const group of ["defaults", "presets", "profiles"]) {
    if (config[group] !== undefined && (!config[group] || typeof config[group] !== "object" || Array.isArray(config[group]))) errors.push(`${source}: ${group} must be a mapping.`);
  }
  for (const [name, profile] of Object.entries(config.profiles || {})) validateProfile(profile, `${source} profile "${name}"`, errors);
  if (config.project !== undefined) validateProjectLink(config.project, `${source} project`, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}

export function validateProfileConfig(profile, source = "profile") {
  const errors = [];
  validateProfile(profile, source, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return profile;
}

export function validateProjectLinkConfig(link, source = "project link") {
  const errors = [];
  validateProjectLink(link, source, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return link;
}

function validateProfile(profile, label, errors) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) { errors.push(`${label} must be a mapping.`); return; }
  for (const key of Object.keys(profile)) if (!PROFILE_KEYS.has(key)) errors.push(`${label}: unknown field "${key}".`);
  if ((profile.type || "wordpress") !== "wordpress") errors.push(`${label}: type must be "wordpress".`);
  if (!profile.ssh?.host) errors.push(`${label}: ssh.host is required.`);
  if (!profile.ssh?.username) errors.push(`${label}: ssh.username is required.`);
  if (!profile.remote?.projectRoot) errors.push(`${label}: remote.projectRoot is required.`);
  if (!profile.remote?.wordpressRoot) errors.push(`${label}: remote.wordpressRoot is required.`);
  const transport = profile.files?.transport || "rsync";
  if (!FILE_TRANSPORTS.has(transport)) errors.push(`${label}: files.transport must be rsync or sftp.`);
  if (profile.files?.targets !== undefined) validateFileTargets(profile.files.targets, `${label}.files.targets`, errors);
  if (!DB_DRIVERS.has(profile.database?.driver)) errors.push(`${label}: database.driver must be wp-cli, docker, or direct.`);
  if (profile.database?.tablePrefix !== undefined && typeof profile.database.tablePrefix !== "string") errors.push(`${label}: database.tablePrefix must be a string.`);
  if (profile.database?.normalizeCollations !== undefined && typeof profile.database.normalizeCollations !== "boolean") errors.push(`${label}: database.normalizeCollations must be a boolean.`);
}

function validateFileTargets(targets, label, errors) {
  if (!isObject(targets)) { errors.push(`${label} must be a mapping.`); return; }
  for (const [name, target] of Object.entries(targets)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { errors.push(`${label}: unsafe target name "${name}".`); continue; }
    if (!isObject(target) || typeof target.path !== "string") { errors.push(`${label}.${name}: path is required.`); continue; }
    if (!isSafeRelativePath(target.path)) errors.push(`${label}.${name}.path: must be a safe relative path (no absolute paths or "..").`);
  }
}

function isSafeRelativePath(value) {
  return /^[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..") && !path.posix.isAbsolute(value);
}

const DEFAULT_FILE_TARGET_NAMES = ["uploads", "plugins", "themes"];

/**
 * Converts a profile's legacy `files.directories`/`files.excludes` shape
 * into the newer `files.targets` map (name -> {path, excludes, includes}).
 * Profiles already written in the new shape pass through untouched. This is
 * the single place callers should normalize through — everything downstream
 * (RemoteProfileService.syncFiles, PullService) consumes only `targets`.
 */
export function normalizeProfile(profile) {
  if (!isObject(profile)) return profile;
  const files = profile.files || {};
  if (files.targets) return profile;
  const names = files.directories || DEFAULT_FILE_TARGET_NAMES;
  const excludes = files.excludes || ["*.log", "node_modules"];
  const includes = files.includes || [];
  const targets = Object.fromEntries(names.map((name) => [name, { path: `wp-content/${name}`, excludes, includes }]));
  return { ...profile, files: { ...files, targets } };
}

function validateProjectLink(link, label, errors) {
  if (!link || typeof link !== "object" || Array.isArray(link)) { errors.push(`${label} must be a mapping.`); return; }
  for (const key of Object.keys(link)) if (!PROJECT_LINK_KEYS.has(key)) errors.push(`${label}: unknown field "${key}".`);
  if (!link.name) errors.push(`${label}: name is required.`);
  if (!link.environment) errors.push(`${label}: environment is required.`);
  if (link.profile !== undefined) {
    if (typeof link.profile === "string") { /* profile name reference, resolved separately */ }
    else if (isObject(link.profile)) validateProfile(link.profile, `${label}.profile`, errors);
    else errors.push(`${label}.profile must be a string (profile name) or a mapping (inline profile).`);
  }
}

export function resolveReferences(value, { env = process.env, commandRunner = defaultSecretCommand } = {}) {
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, { env, commandRunner }));
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.command === "string") return commandRunner(value.command);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveReferences(item, { env, commandRunner })]));
  }
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    if (env[name] === undefined) throw new Error(`Required environment variable ${name} is not set.`);
    return env[name];
  });
}

function defaultSecretCommand(command) {
  const [program, ...args] = splitCommand(command);
  if (!program) throw new Error("Secret command cannot be empty.");
  return execFileSync(program, args, { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function splitCommand(command) {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((part) => part.replace(/^(["'])|(["'])$/g, ""));
}

export function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) return structuredClone(override);
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(override)) merged[key] = isObject(value) && isObject(merged[key]) ? deepMerge(merged[key], value) : structuredClone(value);
  return merged;
}

export function redactSecrets(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactSecrets(item, childKey)]));
  // Fields ending in "Env" (userEnv, passwordEnv, nameEnv, ...) hold the
  // NAME of an environment variable to look up remotely, never a secret
  // value themselves — redacting them (the substring "password" matches
  // "passwordEnv") would hide harmless, useful config for no security benefit.
  const isEnvNameReference = /Env$/.test(key);
  return !isEnvNameReference && /(pass(word)?|secret|token|privateKey|identityFile)/i.test(key) && value ? "[REDACTED]" : value;
}

function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
