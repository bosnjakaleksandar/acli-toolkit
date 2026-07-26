import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import type { AcliConfig } from "../../core/model/AcliConfig.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

export async function loadPreset(presetName: string | undefined, config: Pick<AcliConfig, "presets"> = { presets: {} }, cwd = process.cwd()): Promise<ProjectPlan> {
  if (!presetName) return {};
  if (config.presets?.[presetName]) return normalizePreset({ ...config.presets[presetName], presetName });
  const presetPath = path.resolve(cwd, presetName);
  if (!(await fs.pathExists(presetPath))) throw new Error(`Preset "${presetName}" was not found in configuration or at ${presetPath}.`);
  const document = YAML.parse(await fs.readFile(presetPath, "utf8"));
  const preset = document?.preset || document;
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) throw new Error(`Preset ${presetPath} must be a mapping.`);
  return normalizePreset({ ...preset, presetPath });
}

export function normalizePreset(preset: ProjectPlan): ProjectPlan {
  const normalized: ProjectPlan = { ...preset };
  if (normalized.projectType === "wordpress") Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "wordpress", wpType: "wp-theme", projectType: "wp-theme" });
  if (normalized.projectType === "wordpress-woo") Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "wordpress", wpType: "wp-woo", projectType: "wp-woo" });
  if (["react", "nextjs", "next"].includes(normalized.projectType || "")) {
    const framework = normalized.projectType === "next" ? "nextjs" : normalized.projectType;
    Object.assign(normalized, { setupType: normalized.setupType || "new", appType: "application", framework, projectType: framework, useLaravel: normalized.useLaravel ?? false });
  }
  return normalized;
}

export function hasPresetValue(preset: Record<string, unknown>, key: string): boolean {
  return preset[key] !== undefined && preset[key] !== null && preset[key] !== "";
}
