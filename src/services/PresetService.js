import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { resolveReferences, validateProfileConfig } from "./ConfigService.js";

export async function loadPreset(presetName, config = { presets: {} }, cwd = process.cwd()) {
  if (!presetName) return {};
  if (config.presets?.[presetName]) return normalizePreset({ ...config.presets[presetName], presetName });
  const presetPath = path.resolve(cwd, presetName);
  if (!(await fs.pathExists(presetPath))) throw new Error(`Preset "${presetName}" was not found in configuration or at ${presetPath}.`);
  const document = YAML.parse(await fs.readFile(presetPath, "utf8"));
  const preset = document?.preset || document;
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) throw new Error(`Preset ${presetPath} must be a mapping.`);
  return normalizePreset({ ...preset, presetPath });
}

export async function loadProfile(profileName, config = { profiles: {} }, cwd = process.cwd()) {
  if (!profileName) return null;
  if (config.profiles?.[profileName]) return { ...config.profiles[profileName], profileName };
  const profilePath = path.resolve(cwd, profileName);
  if (!(await fs.pathExists(profilePath))) throw new Error(`Profile "${profileName}" was not found in configuration or at ${profilePath}.`);
  const document = YAML.parse(await fs.readFile(profilePath, "utf8"));
  const profile = document?.profile || document?.profiles?.[profileName] || document;
  validateProfileConfig(profile, `profile ${profilePath}`);
  return { ...resolveReferences(profile), profileName, profilePath };
}

export function normalizePreset(preset) {
  const normalized = { ...preset };
  if (normalized.projectType === "wordpress") Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "wordpress", wpType: "wp-theme", projectType: "wp-theme" });
  if (normalized.projectType === "wordpress-woo") Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "wordpress", wpType: "wp-woo", projectType: "wp-woo" });
  if (["react", "nextjs", "next"].includes(normalized.projectType)) Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "application", framework: normalized.projectType === "next" ? "nextjs" : normalized.projectType, projectType: normalized.projectType === "next" ? "nextjs" : normalized.projectType, useLaravel: normalized.useLaravel ?? false });
  return normalized;
}

export function hasPresetValue(preset, key) { return preset[key] !== undefined && preset[key] !== null && preset[key] !== ""; }
