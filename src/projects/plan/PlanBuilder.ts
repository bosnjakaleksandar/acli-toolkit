import { hasValue as hasField } from "../../core/objects.ts";
import { validateProjectName } from "./projectName.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

const VALID_ENVIRONMENTS = ["docker", "lando"];
const VALID_SETUP_TYPES = ["new", "existing-wp"];
const VALID_APP_TYPES = ["application", "wordpress"];
const VALID_FRAMEWORKS = ["react", "nextjs"];
const VALID_WP_TYPES = ["wp-theme", "wp-woo", "wp-react"];

const FRAMEWORK_ALIASES: Record<string, string> = {
  react: "react",
  next: "nextjs",
  nextjs: "nextjs",
};

const WP_TYPE_ALIASES: Record<string, string> = {
  theme: "wp-theme",
  "wp-theme": "wp-theme",
  woo: "wp-woo",
  "wp-woo": "wp-woo",
  react: "wp-react",
  "wp-react": "wp-react",
};

/**
 * Converts Commander options into the project context shape used by prompts.
 */
export function normalizeCliOptions(options: any = {}): ProjectPlan {
  const normalized: ProjectPlan = {};

  assignIfPresent(normalized, "projectName", options.name);
  assignIfPresent(normalized, "environment", options.environment ?? options.env);
  assignIfPresent(normalized, "mysqlVersion", options.mysql);
  assignIfPresent(normalized, "wpVersion", options.wpVersion);
  assignIfPresent(normalized, "themeRepo", options.themeRepo);
  assignIfPresent(normalized, "themeBranch", options.themeBranch);
  assignIfPresent(normalized, "sshKeyPath", options.sshKey);

  if (options.skipGit) normalized.skipGitInit = true;
  if (options.yes || options.nonInteractive) normalized.nonInteractive = true;

  if (hasValue(options.type)) {
    normalized.setupType = "new";
    normalized.appType = options.type;
  }

  if (hasValue(options.framework)) {
    normalized.setupType = "new";
    normalized.appType = "application";
    normalized.framework = normalizeFramework(options.framework) as ProjectPlan["framework"];
    normalized.projectType = normalized.framework!;
  }

  if (options.laravel) {
    normalized.useLaravel = true;
  }

  if (hasValue(options.wpType)) {
    normalized.setupType = "new";
    normalized.appType = "wordpress";
    normalized.wpType = normalizeWpType(options.wpType) as ProjectPlan["wpType"];
    normalized.projectType = normalized.wpType!;
  }

  return validateProjectContext(normalized, { source: "CLI option" });
}

/**
 * Merges configuration defaults and CLI values, with CLI values taking priority.
 */
export function mergeProjectContext(defaults: ProjectPlan = {}, cliContext: ProjectPlan = {}): ProjectPlan {
  return validateProjectContext({ ...defaults, ...cliContext }, { source: "project context" });
}

/**
 * Validates project context fields that are already present.
 */
export function validateProjectContext(ctx: ProjectPlan = {}, { source = "project context" }: { source?: string } = {}): ProjectPlan {
  const errors: string[] = [];

  if (hasField(ctx, "projectName")) {
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
 */
export function assertRequiredProjectContext(ctx: ProjectPlan = {}): void {
  const missing: string[] = [];

  addMissing(missing, ctx, "setupType", "--type <application|wordpress>");
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
 */
export function normalizeFramework(value: string): string {
  return FRAMEWORK_ALIASES[value] ?? value;
}

/**
 * Normalizes a user-facing WordPress type alias into the internal key.
 */
export function normalizeWpType(value: string): string {
  return WP_TYPE_ALIASES[value] ?? value;
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (hasValue(value)) target[key] = value;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function validateOneOf(errors: string[], ctx: Record<string, unknown>, key: string, validValues: string[], source: string): void {
  if (!hasField(ctx, key)) return;
  if (!validValues.includes(ctx[key] as string)) {
    errors.push(
      `${source} ${key}: "${ctx[key]}" is invalid. Expected one of: ${validValues.join(", ")}.`,
    );
  }
}

function addMissing(missing: string[], ctx: Record<string, unknown>, key: string, option: string): void {
  if (!hasField(ctx, key)) missing.push(option);
}
