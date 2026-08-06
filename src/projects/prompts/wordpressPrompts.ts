import { confirm, multiselect, select, text } from "@clack/prompts";
import { ask, askMysqlVersion, askSshKeyPath, askWpVersion } from "../../ui/prompts.ts";
import { hasPresetValue } from "../plan/presets.ts";
import { isSafePluginSlug } from "../../system/safety.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";
import { DEFAULT_WORDPRESS_VERSION } from "../../config/defaults.ts";

/**
 * Collects every WordPress-specific project setting via interactive prompts
 * (or preset/non-interactive defaults) — theme source, versions, plugins,
 * WP-CLI install. Kept as standalone functions rather than strategy methods:
 * none of this needs the strategy's own `this` (envService, scaffoldEnvironment),
 * only the values already on `ctx`.
 */
export async function askWordPressQuestions(ctx: ProjectPlan, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<ProjectPlan> {
  const mysqlVersion = hasPresetValue(ctx, "mysqlVersion")
    ? ctx.mysqlVersion
    : nonInteractive
      ? "8.0"
      : await askMysqlVersion();
  const wpVersion = hasPresetValue(ctx, "wpVersion")
    ? ctx.wpVersion
    : nonInteractive
      ? DEFAULT_WORDPRESS_VERSION
      : await askWpVersion();

  let themeRepo = ctx.themeRepo;
  if (!hasPresetValue(ctx, "themeRepo") && nonInteractive) {
    themeRepo = process.env.WP_THEME_REPO || "";
  } else if (!hasPresetValue(ctx, "themeRepo")) {
    const defaultRepo = process.env.WP_THEME_REPO;
    const themeChoice = await ask(select, {
      message: "How do you want to create the theme?",
      options: [
        ...(defaultRepo ? [{ label: `Configured starter theme (${defaultRepo})`, value: "starter" }] : []),
        { label: "Custom theme repository", value: "custom" },
        { label: "No template (scaffold minimal theme files)", value: "" },
      ],
    });

    if (themeChoice === "starter") themeRepo = defaultRepo || "";
    if (themeChoice === "custom") {
      themeRepo = await ask(text, {
        message: "Theme repository URL (HTTPS or SSH):",
        validate: (value: string | undefined) => {
          if (!value?.trim()) return "Theme repository URL is required.";
          return undefined;
        },
      });
    }
  }

  const themeBranch = hasPresetValue(ctx, "themeBranch")
    ? ctx.themeBranch
    : nonInteractive
      ? defaultThemeBranch(ctx, themeRepo)
      : await askThemeBranch(ctx, themeRepo);

  let sshKeyPath = "";
  if (
    themeRepo &&
    themeRepo.startsWith("git@") &&
    !hasPresetValue(ctx, "sshKeyPath") &&
    !nonInteractive
  ) {
    sshKeyPath = await askSshKeyPath();
  } else {
    sshKeyPath = ctx.sshKeyPath || "";
  }

  let plugins = hasPresetValue(ctx, "plugins")
    ? normalizePlugins(ctx.plugins)
    : nonInteractive || !ctx.customizeAdvanced
      ? []
      : await askPlugins();
  if (ctx.projectType === "wp-woo" && !plugins.includes("woocommerce")) plugins = ["woocommerce", ...plugins];

  const installWpCli = hasPresetValue(ctx, "installWpCli")
    ? Boolean(ctx.installWpCli)
    : nonInteractive || !ctx.customizeAdvanced
      ? false
      : await ask(confirm, {
          message: "Install WP-CLI inside the local environment when supported?",
          initialValue: false,
        });

  return {
    ...ctx,
    mysqlVersion,
    wpVersion,
    themeRepo,
    themeBranch,
    sshKeyPath,
    plugins,
    installWpCli,
  };
}

async function askThemeBranch(ctx: ProjectPlan, themeRepo: string | undefined): Promise<string> {
  if (!themeRepo) return "";
  const defaultBranch = defaultThemeBranch(ctx, themeRepo);

  return ask(text, {
    message: "Theme branch (leave empty for repository default):",
    initialValue: defaultBranch,
  });
}

function defaultThemeBranch(ctx: ProjectPlan, themeRepo: string | undefined): string {
  if (!themeRepo) return "";
  return ctx.projectType === "wp-woo"
    ? process.env.WP_WOO_BRANCH || "woocommerce"
    : ctx.projectType === "wp-react"
      ? process.env.WP_REACT_BRANCH || "react"
      : "";
}

async function askPlugins(): Promise<string[]> {
  const selected = await ask(multiselect, {
    message: "Optional plugins to install:",
    options: [
      { label: "WooCommerce", value: "woocommerce" },
      { label: "Advanced Custom Fields", value: "advanced-custom-fields" },
      { label: "Yoast SEO", value: "wordpress-seo" },
    ],
    required: false,
  });

  return (selected as string[] | undefined) || [];
}

export function normalizePlugins(plugins: unknown): string[] {
  const list = Array.isArray(plugins)
    ? plugins
    : typeof plugins === "string"
      ? plugins.split(",").map((plugin) => plugin.trim()).filter(Boolean)
      : [];
  // Plugin slugs are written verbatim into a generated, executable shell
  // script (setupScript.ts's writeWordPressSetupScript) — validating against
  // WordPress.org's slug grammar here, before that script is ever created,
  // keeps a maliciously-crafted preset/--set value from injecting shell
  // commands.
  const invalid = list.filter((plugin) => !isSafePluginSlug(plugin));
  if (invalid.length) throw new Error(`Invalid plugin slug(s): ${invalid.join(", ")}. Plugin slugs may only contain lowercase letters, digits, and hyphens.`);
  return list;
}
