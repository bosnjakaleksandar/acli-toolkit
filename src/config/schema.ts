import { CONFIG_VERSION } from "./defaults.ts";
import type { AcliConfig, ProjectLink } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";
import { isSafeSshHostAlias } from "../system/safety.ts";
import { isObject, isValidPort } from "../core/objects.ts";
import { getProvider, PROVIDER_NAMES } from "../providers/registry.ts";

export { isObject } from "../core/objects.ts";

const ROOT_KEYS = new Set(["version", "defaults", "presets", "profiles"]);
const PROJECT_ROOT_KEYS = new Set([...ROOT_KEYS, "project"]);
const PROJECT_LINK_KEYS = new Set(["name", "type", "environment", "profile", "linkedAt"]);
const HOST_KEY_POLICIES = new Set(["strict", "accept-new", "insecure"]);
// Profile fields every provider shares; each provider adds its own
// (ProviderDefinition.profileKeys) and validates them itself.
const SHARED_PROFILE_KEYS = ["type", "provider", "ssh", "database", "git", "urls", "local"];

export function validateConfig(config: AcliConfig, source = "configuration", { allowProjectKey = false }: { allowProjectKey?: boolean } = {}): AcliConfig {
  const errors: string[] = [];
  if (config.version !== CONFIG_VERSION) errors.push(`${source}: top-level version must be ${CONFIG_VERSION}.`);
  const allowedRootKeys = allowProjectKey ? PROJECT_ROOT_KEYS : ROOT_KEYS;
  for (const key of Object.keys(config)) if (!allowedRootKeys.has(key)) errors.push(`${source}: unknown top-level field "${key}".`);
  for (const group of ["defaults", "presets", "profiles"] as const) {
    if (config[group] !== undefined && (!config[group] || typeof config[group] !== "object" || Array.isArray(config[group]))) errors.push(`${source}: ${group} must be a mapping.`);
  }
  // `defaults`/`presets` are a free-form bag of flat ProjectPlan scaffolding
  // fields (mysqlVersion, plugins, setupType, ...), so nested objects are
  // rejected rather than silently ignored.
  if (isObject(config.defaults)) validatePlanFields(config.defaults, `${source}: defaults`, errors);
  if (isObject(config.presets)) {
    for (const [name, preset] of Object.entries(config.presets)) {
      if (!isObject(preset)) { errors.push(`${source}: presets.${name} must be a mapping.`); continue; }
      validatePlanFields(preset, `${source}: presets.${name}`, errors);
    }
  }
  for (const [name, profile] of Object.entries(config.profiles || {})) validateProfile(profile, `${source} profile "${name}"`, errors);
  const reference = findRemovedReference(config);
  if (reference) errors.push(`${source}: "${reference}" uses a \${ENV_VAR} or {command: ...} reference, which A-CLI 2.1 no longer resolves. Write the value itself (profiles live in your own user config, which isn't shared).`);
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
  const provider = getProvider(profile);
  if (!provider) errors.push(`${label}: provider must be one of ${PROVIDER_NAMES.join(", ")}.`);
  const knownKeys = new Set([...SHARED_PROFILE_KEYS, ...(provider?.profileKeys || [])]);
  for (const key of Object.keys(profile)) if (!knownKeys.has(key)) errors.push(`${label}: unknown field "${key}".`);
  if (((profile as unknown as Record<string, unknown>).type || "wordpress") !== "wordpress") errors.push(`${label}: type must be "wordpress".`);
  if (!profile.ssh?.host) errors.push(`${label}: ssh.host is required.`);
  if (!profile.ssh?.username) errors.push(`${label}: ssh.username is required.`);
  if (profile.ssh?.port !== undefined && !isValidPort(profile.ssh.port)) errors.push(`${label}: ssh.port must be an integer from 1 to 65535.`);
  if (profile.ssh?.hostKeyPolicy !== undefined && !HOST_KEY_POLICIES.has(profile.ssh.hostKeyPolicy)) errors.push(`${label}: ssh.hostKeyPolicy must be strict, accept-new, or insecure.`);
  if (profile.database?.tablePrefix !== undefined && typeof profile.database.tablePrefix !== "string") errors.push(`${label}: database.tablePrefix must be a string.`);
  if (profile.database?.normalizeCollations !== undefined && typeof profile.database.normalizeCollations !== "boolean") errors.push(`${label}: database.normalizeCollations must be a boolean.`);
  if (profile.git?.sshHostAlias !== undefined && !isSafeSshHostAlias(profile.git.sshHostAlias)) errors.push(`${label}: git.sshHostAlias must be a valid SSH config Host alias (letters, numbers, dots, dashes, and underscores).`);
  provider?.validate(profile, label, errors);
}

/** Finds a `${ENV_VAR}` string or `{command: "..."}` object anywhere in the document, returning its dotted path. */
function findRemovedReference(value: unknown, keyPath: string[] = []): string | null {
  if (typeof value === "string") return /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value) ? keyPath.join(".") : null;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) { const found = findRemovedReference(item, [...keyPath, String(index)]); if (found) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 1 && entries[0]![0] === "command" && typeof entries[0]![1] === "string") return keyPath.join(".");
  for (const [key, item] of entries) { const found = findRemovedReference(item, [...keyPath, key]); if (found) return found; }
  return null;
}

function validatePlanFields(fields: Record<string, unknown>, label: string, errors: string[]): void {
  for (const [key, value] of Object.entries(fields)) {
    if (!isPlainScalar(value)) errors.push(`${label}.${key}: must be a string, number, or boolean (or an array of those) — nested objects are not allowed here.`);
  }
}

function isPlainScalar(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isPlainScalar);
  return false;
}

function validateProjectLink(link: ProjectLink, label: string, errors: string[]): void {
  if (!link || typeof link !== "object" || Array.isArray(link)) { errors.push(`${label} must be a mapping.`); return; }
  for (const key of Object.keys(link)) if (!PROJECT_LINK_KEYS.has(key)) errors.push(`${label}: unknown field "${key}".`);
  if (!link.name) errors.push(`${label}: name is required.`);
  if (!link.environment) errors.push(`${label}: environment is required.`);
  if (link.profile !== undefined && typeof link.profile !== "string") errors.push(`${label}.profile must be the name of a profile in your user config (inline profiles are no longer supported).`);
}


