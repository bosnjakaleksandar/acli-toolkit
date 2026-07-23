import { hasPresetValue } from "./PresetService.js";
import { validateProjectName } from "./ProjectValidationService.js";

const VALID_ENVIRONMENTS = ["docker", "lando"];
const VALID_SETUP_TYPES = ["new", "existing-wp"];
const VALID_APP_TYPES = ["application", "wordpress"];
const VALID_FRAMEWORKS = ["react", "nextjs"];
const VALID_WP_TYPES = ["wp-theme", "wp-woo", "wp-react"];

const FRAMEWORK_ALIASES = {
  react: "react",
  next: "nextjs",
  nextjs: "nextjs",
};

const WP_TYPE_ALIASES = {
  theme: "wp-theme",
  "wp-theme": "wp-theme",
  woo: "wp-woo",
  "wp-woo": "wp-woo",
  react: "wp-react",
  "wp-react": "wp-react",
};

/**
 * Converts Commander options into the project context shape used by prompts and presets.
 *
 * @param {object} options Raw Commander options.
 * @returns {object} Normalized project context values supplied by the CLI.
 */
export function normalizeCliOptions(options = {}) {
  const normalized = {};

  assignIfPresent(normalized, "projectName", options.name);
  assignIfPresent(normalized, "environment", options.environment ?? options.env);
  assignIfPresent(normalized, "mysqlVersion", options.mysql);
  assignIfPresent(normalized, "wpVersion", options.wpVersion);
  assignIfPresent(normalized, "themeRepo", options.themeRepo);
  assignIfPresent(normalized, "themeBranch", options.themeBranch);
  assignIfPresent(normalized, "stagingUrl", options.stagingUrl);
  assignIfPresent(normalized, "sshKeyPath", options.sshKey);

  if (options.keepDump) normalized.keepDump = true;
  if (options.skipFiles) normalized.skipFiles = true;
  if (options.skipDatabase) normalized.skipDatabase = true;
  if (options.skipGitLink) normalized.skipGitLink = true;

  if (options.skipGit) normalized.skipGitInit = true;
  if (options.yes || options.nonInteractive) normalized.nonInteractive = true;

  if (hasValue(options.type)) {
    normalized.setupType = "new";
    normalized.appType = options.type;
  }

  if (hasValue(options.framework)) {
    normalized.setupType = "new";
    normalized.appType = "application";
    normalized.framework = normalizeFramework(options.framework);
    normalized.projectType = normalized.framework;
  }

  if (options.laravel) {
    normalized.useLaravel = true;
  }

  if (hasValue(options.wpType)) {
    normalized.setupType = "new";
    normalized.appType = "wordpress";
    normalized.wpType = normalizeWpType(options.wpType);
    normalized.projectType = normalized.wpType;
  }

  if (options.existing) {
    normalized.setupType = "existing-wp";
    normalized.appType = "wordpress";
    normalized.projectType = "wp-existing";
  }

  return validateProjectContext(normalized, { source: "CLI option" });
}

/**
 * Merges preset values and CLI values, with CLI values taking priority.
 *
 * @param {object} preset Loaded preset context.
 * @param {object} cliContext Normalized CLI context.
 * @returns {object} Merged project context.
 */
export function mergeProjectContext(preset = {}, cliContext = {}) {
  return validateProjectContext({ ...preset, ...cliContext }, { source: "project context" });
}

export function parseSetOverrides(values = []) {
  const result = {};
  for (const entry of values) {
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error(`Invalid --set value "${entry}". Expected key=value.`);
    const keys = entry.slice(0, separator).split(".");
    if (keys.some((key) => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key))) throw new Error(`Invalid --set key in "${entry}".`);
    let target = result;
    for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    target[keys.at(-1)] = parseScalar(entry.slice(separator + 1));
  }
  return result;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/**
 * Validates project context fields that are already present.
 *
 * @param {object} ctx Project context.
 * @param {{source?: string}} options Validation options.
 * @returns {object} The validated context.
 */
export function validateProjectContext(ctx = {}, { source = "project context" } = {}) {
  const errors = [];

  if (hasPresetValue(ctx, "projectName")) {
    const message = validateProjectName(String(ctx.projectName));
    if (message) errors.push(`${source} project name: ${message}`);
  }

  validateOneOf(errors, ctx, "environment", VALID_ENVIRONMENTS, source);
  validateOneOf(errors, ctx, "setupType", VALID_SETUP_TYPES, source);
  validateOneOf(errors, ctx, "appType", VALID_APP_TYPES, source);
  validateOneOf(errors, ctx, "framework", VALID_FRAMEWORKS, source);
  validateOneOf(errors, ctx, "wpType", VALID_WP_TYPES, source);

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  return ctx;
}

/**
 * Throws a helpful error when non-interactive mode does not have enough context.
 *
 * @param {object} ctx Project context.
 */
export function assertRequiredProjectContext(ctx = {}) {
  const missing = [];

  addMissing(missing, ctx, "setupType", "--type <application|wordpress> or --existing");
  addMissing(missing, ctx, "projectName", "--name <name>");
  // Application projects (React/Next.js/Laravel) no longer use Docker/Lando
  // — they're scaffolded by their official generators and run via their own
  // dev servers — so --environment isn't required for them.
  if (ctx.appType !== "application") addMissing(missing, ctx, "environment", "--environment <docker|lando>");

  if (ctx.setupType === "new") {
    addMissing(missing, ctx, "appType", "--type <application|wordpress>");

    if (ctx.appType === "application") {
      addMissing(missing, ctx, "framework", "--framework <react|nextjs>");
    }

    if (ctx.appType === "wordpress") {
      addMissing(missing, ctx, "wpType", "--wp-type <theme|woo|react>");
    }
  }

  if (missing.length) {
    const label = missing.length === 1 ? "Missing required option" : "Missing required options";
    throw new Error(`${label}:\n${missing.map((option) => `- ${option}`).join("\n")}`);
  }
}

/**
 * Normalizes a user-facing framework alias into the internal key.
 *
 * @param {string} value User supplied framework.
 * @returns {string} Internal framework key.
 */
export function normalizeFramework(value) {
  return FRAMEWORK_ALIASES[value] ?? value;
}

/**
 * Normalizes a user-facing WordPress type alias into the internal key.
 *
 * @param {string} value User supplied WordPress type.
 * @returns {string} Internal WordPress type key.
 */
export function normalizeWpType(value) {
  return WP_TYPE_ALIASES[value] ?? value;
}

function assignIfPresent(target, key, value) {
  if (hasValue(value)) target[key] = value;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function validateOneOf(errors, ctx, key, validValues, source) {
  if (!hasPresetValue(ctx, key)) return;
  if (!validValues.includes(ctx[key])) {
    errors.push(
      `${source} ${key}: "${ctx[key]}" is invalid. Expected one of: ${validValues.join(", ")}.`,
    );
  }
}

function addMissing(missing, ctx, key, option) {
  if (!hasPresetValue(ctx, key)) missing.push(option);
}
