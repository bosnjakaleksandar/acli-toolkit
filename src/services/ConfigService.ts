import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import YAML from "yaml";
import { BUILT_IN_CONFIG, CONFIG_VERSION } from "../config/defaults.ts";
import { getProjectConfigPath, getUserConfigPath } from "../config/paths.ts";
import { isConfigTrusted } from "./ConfigTrustService.ts";
import type { AcliConfig, ProjectLink } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/ResolvedProfile.ts";

const ROOT_KEYS = new Set(["version", "defaults", "presets", "profiles"]);
const PROJECT_ROOT_KEYS = new Set([...ROOT_KEYS, "project"]);
const PROFILE_KEYS = new Set(["type", "ssh", "remote", "files", "database", "git", "urls", "local"]);
const PROJECT_LINK_KEYS = new Set(["name", "type", "environment", "profile", "linkedAt"]);
const DB_DRIVERS = new Set(["wp-cli", "docker", "direct"]);
const FILE_TRANSPORTS = new Set(["rsync", "sftp"]);

export { getProjectConfigPath, getUserConfigPath };

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  env?: Record<string, string | undefined>;
  resolveSecrets?: boolean;
}

export interface LoadConfigResult {
  config: AcliConfig;
  rawConfig: AcliConfig;
  sources: Array<{ name: string; value: AcliConfig }>;
}

export async function loadConfig({ cwd = process.cwd(), configPath, env = process.env, resolveSecrets = true }: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const sources: Array<{ name: string; value: AcliConfig }> = [{ name: "built-in defaults", value: structuredClone(BUILT_IN_CONFIG) as AcliConfig }];
  // Only the project-scoped file (or an explicit --config, which behaves like
  // one) may declare a `project:` link — the user-level config is shared
  // across every project on the machine, so a link there could never be
  // meaningful. `autoDiscovered` marks the one candidate that A-CLI reads
  // without being asked to: the project config found by walking up from cwd.
  // Unlike an explicit --config (the user pointed at it on purpose) or the
  // user-level config (lives on this machine, not in a repo someone else
  // wrote), an auto-discovered project config may have arrived via `git
  // clone` — see the trust check below.
  const candidates = configPath
    ? [{ name: `explicit config (${path.resolve(cwd, configPath)})`, path: path.resolve(cwd, configPath), required: true, allowProjectKey: true, autoDiscovered: false }]
    : [
        { name: `user config (${getUserConfigPath()})`, path: getUserConfigPath(), required: false, allowProjectKey: false, autoDiscovered: false },
        { name: `project config (${getProjectConfigPath(cwd)})`, path: getProjectConfigPath(cwd), required: false, allowProjectKey: true, autoDiscovered: true },
      ];

  for (const candidate of candidates) {
    if (!(await fs.pathExists(candidate.path))) {
      if (candidate.required) throw new Error(`Configuration file not found: ${candidate.path}`);
      continue;
    }
    const rawText = await fs.readFile(candidate.path, "utf8");
    const value = parseConfigText(rawText, candidate.path);
    validateConfig(value, candidate.name, { allowProjectKey: candidate.allowProjectKey });

    if (resolveSecrets && candidate.autoDiscovered) {
      const secretPath = findSecretReferencePath(value);
      if (secretPath) {
        const trusted = env.ACLI_TRUST_PROJECT_CONFIG === "1" || (await isConfigTrusted(candidate.path, rawText, env));
        if (!trusted) {
          throw new Error(
            `Refusing to resolve secrets from ${candidate.path}: it declares a secret command or environment-variable reference at "${secretPath}".\n` +
              `This file lives in the current project directory, which may have come from somewhere else (e.g. git clone) rather than from you — A-CLI will not execute commands from it automatically.\n` +
              `If you trust this file, run "acli config trust" to approve it, or set ACLI_TRUST_PROJECT_CONFIG=1 to bypass this check for a single command.`,
          );
        }
      }
    }

    sources.push({ name: candidate.name, value });
  }

  const config = sources.reduce((result, source) => deepMerge(result, source.value), {} as AcliConfig);
  validateConfig(config, "resolved configuration", { allowProjectKey: true });
  const resolved = resolveSecrets ? (resolveReferences(config, { env }) as AcliConfig) : config;
  return { config: resolved, rawConfig: config, sources };
}

export async function readConfigFile(filePath: string): Promise<AcliConfig> {
  return parseConfigText(await fs.readFile(filePath, "utf8"), filePath);
}

function parseConfigText(text: string, filePath: string): AcliConfig {
  let parsed;
  try {
    parsed = YAML.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse configuration ${filePath}: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Configuration ${filePath} must be an object.`);
  return parsed;
}

/**
 * Finds the first `{command: "..."}` secret reference or `${ENV_VAR}` string
 * anywhere within `value`, returning its dotted key path (or null if none is
 * found) — used to decide whether an auto-discovered project config needs to
 * be trusted before its secrets are resolved. Scans the *entire* document
 * (every root key, not just "profiles"/"project.profile"): resolveReferences
 * below walks the whole merged config, so anything it would resolve must be
 * covered here too, or a `${ENV_VAR}` reference tucked into e.g.
 * `defaults.themeRepo` would resolve — and then get embedded in a `git
 * clone` URL — without ever tripping the trust check.
 */
function findSecretReferencePath(value: unknown, keyPath: string[] = []): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSecretReferencePath(value[index], [...keyPath, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command" && typeof entries[0]![1] === "string") return [...keyPath, "command"].join(".");
    for (const [key, item] of entries) {
      const found = findSecretReferencePath(item, [...keyPath, key]);
      if (found) return found;
    }
    return null;
  }
  return typeof value === "string" && /\$\{[A-Z_][A-Z0-9_]*\}/.test(value) ? keyPath.join(".") : null;
}

export function validateConfig(config: AcliConfig, source = "configuration", { allowProjectKey = false }: { allowProjectKey?: boolean } = {}): AcliConfig {
  const errors: string[] = [];
  if (config.version !== CONFIG_VERSION) errors.push(`${source}: top-level version must be ${CONFIG_VERSION}.`);
  const allowedRootKeys = allowProjectKey ? PROJECT_ROOT_KEYS : ROOT_KEYS;
  for (const key of Object.keys(config)) if (!allowedRootKeys.has(key)) errors.push(`${source}: unknown top-level field "${key}".`);
  for (const group of ["defaults", "presets", "profiles"] as const) {
    if (config[group] !== undefined && (!config[group] || typeof config[group] !== "object" || Array.isArray(config[group]))) errors.push(`${source}: ${group} must be a mapping.`);
  }
  // `defaults`/`presets` are a free-form bag of ProjectPlan scaffolding
  // fields (mysqlVersion, plugins, setupType, ...) — never a place secrets
  // belong. Restricting them to plain scalars (rather than accepting any
  // nested object) closes off hiding a `{command: "..."}` secret reference
  // under an arbitrary preset/default key, where resolveReferences would
  // otherwise execute it unconditionally.
  if (isObject(config.defaults)) validatePlanFields(config.defaults, `${source}: defaults`, errors);
  if (isObject(config.presets)) {
    for (const [name, preset] of Object.entries(config.presets)) {
      if (!isObject(preset)) { errors.push(`${source}: presets.${name} must be a mapping.`); continue; }
      validatePlanFields(preset, `${source}: presets.${name}`, errors);
    }
  }
  for (const [name, profile] of Object.entries(config.profiles || {})) validateProfile(profile, `${source} profile "${name}"`, errors);
  if (config.project !== undefined) validateProjectLink(config.project, `${source} project`, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}

export function validateProfileConfig(profile: Profile, source = "profile"): Profile {
  const errors: string[] = [];
  validateProfile(profile, source, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return profile;
}

export function validateProjectLinkConfig(link: ProjectLink, source = "project link"): ProjectLink {
  const errors: string[] = [];
  validateProjectLink(link, source, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return link;
}

function validateProfile(profile: Profile, label: string, errors: string[]): void {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) { errors.push(`${label} must be a mapping.`); return; }
  for (const key of Object.keys(profile)) if (!PROFILE_KEYS.has(key)) errors.push(`${label}: unknown field "${key}".`);
  if (((profile as unknown as Record<string, unknown>).type || "wordpress") !== "wordpress") errors.push(`${label}: type must be "wordpress".`);
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

function validatePlanFields(fields: Record<string, unknown>, label: string, errors: string[]): void {
  for (const [key, value] of Object.entries(fields)) {
    if (!isPlainScalar(value)) errors.push(`${label}.${key}: must be a string, number, or boolean (or an array of those) — nested objects, including secret "command" references, are not allowed here.`);
  }
}

function isPlainScalar(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isPlainScalar);
  return false;
}

function validateFileTargets(targets: Record<string, { path: string }>, label: string, errors: string[]): void {
  if (!isObject(targets)) { errors.push(`${label} must be a mapping.`); return; }
  for (const [name, target] of Object.entries(targets)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { errors.push(`${label}: unsafe target name "${name}".`); continue; }
    if (!isObject(target) || typeof target.path !== "string") { errors.push(`${label}.${name}: path is required.`); continue; }
    if (!isSafeRelativePath(target.path)) errors.push(`${label}.${name}.path: must be a safe relative path (no absolute paths or "..").`);
  }
}

function isSafeRelativePath(value: string): boolean {
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
export function normalizeProfile(profile: Profile): Profile {
  if (!isObject(profile)) return profile;
  const files = (profile.files || {}) as Record<string, unknown>;
  if (files.targets) return profile;
  const names = (files.directories as string[]) || DEFAULT_FILE_TARGET_NAMES;
  const excludes = (files.excludes as string[]) || ["*.log", "node_modules"];
  const includes = (files.includes as string[]) || [];
  const targets = Object.fromEntries(names.map((name) => [name, { path: `wp-content/${name}`, excludes, includes }]));
  return { ...profile, files: { ...files, targets } } as Profile;
}

function validateProjectLink(link: ProjectLink, label: string, errors: string[]): void {
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

export function resolveReferences(value: unknown, { env = process.env, commandRunner = defaultSecretCommand }: { env?: Record<string, string | undefined>; commandRunner?: (command: string) => string } = {}): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, { env, commandRunner }));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command" && typeof entries[0]![1] === "string") return commandRunner(entries[0]![1] as string);
    return Object.fromEntries(entries.map(([key, item]) => [key, resolveReferences(item, { env, commandRunner })]));
  }
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    if (env[name] === undefined) throw new Error(`Required environment variable ${name} is not set.`);
    return env[name]!;
  });
}

function defaultSecretCommand(command: string): string {
  const [program, ...args] = splitCommand(command);
  if (!program) throw new Error("Secret command cannot be empty.");
  return execFileSync(program, args, { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function splitCommand(command: string): string[] {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((part) => part.replace(/^(["'])|(["'])$/g, ""));
}

export function deepMerge<T>(base: T, override: T): T {
  if (!isObject(base) || !isObject(override)) return structuredClone(override);
  const merged: Record<string, unknown> = structuredClone(base as Record<string, unknown>);
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    merged[key] = isObject(value) && isObject(merged[key]) ? deepMerge(merged[key], value) : structuredClone(value);
  }
  return merged as T;
}

export function redactSecrets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactSecrets(item, childKey)]));
  // Fields ending in "Env" (userEnv, passwordEnv, nameEnv, ...) hold the
  // NAME of an environment variable to look up remotely, never a secret
  // value themselves — redacting them (the substring "password" matches
  // "passwordEnv") would hide harmless, useful config for no security benefit.
  const isEnvNameReference = /Env$/.test(key);
  return !isEnvNameReference && /(pass(word)?|secret|token|privateKey|identityFile)/i.test(key) && value ? "[REDACTED]" : value;
}

/**
 * Finds sensitive-looking fields (same key heuristic as redactSecrets) that
 * hold a literal value rather than a `${ENV_VAR}`/`{command: ...}` reference —
 * e.g. a hardcoded local `identityFile` path. Used to warn before a profile
 * is exported for sharing, where a value that's fine for solo use (a path
 * only meaningful on the exporter's own machine) would silently break for
 * whoever imports it.
 */
export function findLiteralSecretFields(value: unknown, keyPath: string[] = [], parentKey = "", out: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((item, index) => findLiteralSecretFields(item, [...keyPath, String(index)], parentKey, out)); return out; }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "command") return out; // a secret-command reference, not a literal
    for (const [childKey, item] of entries) findLiteralSecretFields(item, [...keyPath, childKey], childKey, out);
    return out;
  }
  const isEnvNameReference = /Env$/.test(parentKey);
  const isSensitiveKey = !isEnvNameReference && /(pass(word)?|secret|token|privateKey|identityFile)/i.test(parentKey);
  if (isSensitiveKey && typeof value === "string" && value && !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value)) out.push(keyPath.join("."));
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
