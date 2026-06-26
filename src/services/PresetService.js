import fs from "fs-extra";
import path from "path";

const BUILT_IN_PRESETS = {
  wordpress: {
    setupType: "new",
    appType: "wordpress",
    projectType: "wp-theme",
    wpType: "wp-theme",
  },
  "wordpress-woo": {
    setupType: "new",
    appType: "wordpress",
    projectType: "wp-woo",
    wpType: "wp-woo",
  },
  react: {
    setupType: "new",
    appType: "application",
    framework: "react",
    projectType: "react",
    useLaravel: false,
  },
  next: {
    setupType: "new",
    appType: "application",
    framework: "nextjs",
    projectType: "nextjs",
    useLaravel: false,
  },
  "laravel-react": {
    setupType: "new",
    appType: "application",
    framework: "react",
    projectType: "react",
    useLaravel: true,
  },
  "laravel-next": {
    setupType: "new",
    appType: "application",
    framework: "nextjs",
    projectType: "nextjs",
    useLaravel: true,
  },
};

/**
 * Loads a built-in preset or a JSON preset file.
 *
 * @param {string | undefined} presetName Built-in preset key or path to JSON.
 * @returns {Promise<object>}
 */
export async function loadPreset(presetName) {
  if (!presetName) return {};

  if (BUILT_IN_PRESETS[presetName]) {
    return { ...BUILT_IN_PRESETS[presetName], presetName };
  }

  const presetPath = path.resolve(process.cwd(), presetName);
  if (!(await fs.pathExists(presetPath))) {
    throw new Error(
      `Preset "${presetName}" was not found. Use a built-in preset or a path to a JSON file.`,
    );
  }

  const preset = await fs.readJSON(presetPath);
  return normalizePreset({ ...preset, presetPath });
}

/**
 * Normalizes user-facing preset project type aliases into internal context fields.
 *
 * @param {object} preset Raw preset.
 * @returns {object}
 */
export function normalizePreset(preset) {
  const normalized = { ...preset };

  if (normalized.projectType === "wordpress") {
    normalized.setupType ??= "new";
    normalized.appType = "wordpress";
    normalized.wpType = "wp-theme";
    normalized.projectType = "wp-theme";
  }

  if (normalized.projectType === "wordpress-woo") {
    normalized.setupType ??= "new";
    normalized.appType = "wordpress";
    normalized.wpType = "wp-woo";
    normalized.projectType = "wp-woo";
  }

  if (normalized.projectType === "react" || normalized.projectType === "nextjs") {
    normalized.setupType ??= "new";
    normalized.appType = "application";
    normalized.framework = normalized.projectType;
    normalized.useLaravel ??= false;
  }

  if (normalized.projectType === "next") {
    normalized.setupType ??= "new";
    normalized.appType = "application";
    normalized.framework = "nextjs";
    normalized.projectType = "nextjs";
    normalized.useLaravel ??= false;
  }

  return normalized;
}

/**
 * Returns true when the preset supplied a meaningful value for the field.
 *
 * @param {object} preset Loaded preset.
 * @param {string} key Field name.
 * @returns {boolean}
 */
export function hasPresetValue(preset, key) {
  return preset[key] !== undefined && preset[key] !== null && preset[key] !== "";
}
