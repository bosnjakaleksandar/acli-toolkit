import path from "node:path";
import { CONFIG_VERSION } from "./defaults.ts";
import type { AcliConfig, ProjectLink } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";

const ROOT_KEYS = new Set(["version", "defaults", "presets", "profiles"]);
const PROJECT_ROOT_KEYS = new Set([...ROOT_KEYS, "project"]);
const PROFILE_KEYS = new Set(["type", "ssh", "remote", "files", "database", "git", "urls", "local"]);
const PROJECT_LINK_KEYS = new Set(["name", "type", "environment", "profile", "linkedAt"]);
const DB_DRIVERS = new Set(["wp-cli", "docker", "direct"]);
const FILE_TRANSPORTS = new Set(["rsync", "sftp"]);

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

export function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
