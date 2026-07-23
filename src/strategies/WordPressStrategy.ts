import BaseStrategy from "./BaseStrategy.ts";
import { confirm, multiselect, select, text } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../utils/git.js";
import { runCommand } from "../utils/commandRunner.ts";
import {
  ask,
  askMysqlVersion,
  askWpVersion,
  askSshKeyPath,
} from "../utils/prompts.js";
import { hasPresetValue } from "../services/PresetService.ts";
import type { Spinner } from "../services/EnvironmentService.ts";

export default class WordPressStrategy extends BaseStrategy {
  override async askQuestions(ctx: any, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<any> {
    const mysqlVersion = hasPresetValue(ctx, "mysqlVersion")
      ? ctx.mysqlVersion
      : nonInteractive
        ? "8.0"
        : await askMysqlVersion();
    const wpVersion = hasPresetValue(ctx, "wpVersion")
      ? ctx.wpVersion
      : nonInteractive
        ? "latest"
        : await askWpVersion();

    let themeRepo = ctx.themeRepo;
    if (!hasPresetValue(ctx, "themeRepo") && nonInteractive) {
      themeRepo = process.env.WP_THEME_REPO || "";
    } else if (!hasPresetValue(ctx, "themeRepo")) {
      const defaultRepo = process.env.WP_THEME_REPO || "git@github.com:starter-theme.git";
      const themeChoice = await ask(select, {
        message: "How do you want to create the theme?",
        options: [
          { label: `Starter theme (${defaultRepo})`, value: "starter" },
          { label: "Custom theme repository", value: "custom" },
          { label: "No template (scaffold minimal theme files)", value: "" },
        ],
      });

      if (themeChoice === "starter") themeRepo = defaultRepo;
      if (themeChoice === "custom") {
        themeRepo = await ask(text, {
          message: "Theme repository URL (HTTPS or SSH):",
          validate: (value: string) => {
            if (!value.trim()) return "Theme repository URL is required.";
            return undefined;
          },
        });
      }
    }

    const themeBranch = hasPresetValue(ctx, "themeBranch")
      ? ctx.themeBranch
      : nonInteractive
        ? this.#defaultThemeBranch(ctx, themeRepo)
        : await this.#askThemeBranch(ctx, themeRepo);

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

    const plugins = hasPresetValue(ctx, "plugins")
      ? normalizePlugins(ctx.plugins)
      : nonInteractive || !ctx.customizeAdvanced
        ? []
        : await this.#askPlugins();

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

  async #askThemeBranch(ctx: any, themeRepo: string): Promise<string> {
    if (!themeRepo) return "";
    const defaultBranch = this.#defaultThemeBranch(ctx, themeRepo);

    return ask(text, {
      message: "Theme branch (leave empty for repository default):",
      initialValue: defaultBranch,
    });
  }

  #defaultThemeBranch(ctx: any, themeRepo: string): string {
    if (!themeRepo) return "";
    return ctx.projectType === "wp-woo"
      ? process.env.WP_WOO_BRANCH || "woocommerce"
      : ctx.projectType === "wp-react"
        ? process.env.WP_REACT_BRANCH || "react"
        : "";
  }

  async #askPlugins(): Promise<string[]> {
    const selected = await ask(multiselect, {
      message: "Optional plugins to install:",
      options: [
        { label: "WooCommerce", value: "woocommerce" },
        { label: "Advanced Custom Fields", value: "advanced-custom-fields" },
        { label: "Yoast SEO", value: "wordpress-seo" },
      ],
      required: false,
    });

    return selected || [];
  }

  override async scaffold(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    if (!ctx.skipEnvironment) {
      await this.scaffoldEnvironment(targetDir, ctx, spinner);
    }

    const { projectName, themeRepo, themeBranch } = ctx;
    const themeDir = path.join(targetDir, "wp-content", "themes", projectName);
    await fs.ensureDir(themeDir);

    if (themeRepo) {
      console.log(
        chalk.cyan(
          `\nCloning theme from ${themeRepo}${themeBranch ? ` (${themeBranch})` : ""}...`,
        ),
      );
      try {
        let envVars = { ...process.env };
        if (ctx.sshKeyPath) {
          const resolvedKeyPath = ctx.sshKeyPath.replace(
            /^~/,
            process.env.HOME,
          );
          envVars.GIT_SSH_COMMAND = `ssh -i ${resolvedKeyPath} -o IdentitiesOnly=yes`;
        }

        const args = ["clone"];
        if (themeBranch) args.push("--branch", themeBranch);
        args.push(themeRepo, ".");
        await runCommand("git", args, {
          cwd: themeDir,
          env: envVars,
        });
        await fs.remove(path.join(themeDir, ".git"));
        console.log(
          chalk.green(`Removed .git tracking from the cloned starter theme.`),
        );
      } catch (e: any) {
        await fs.remove(themeDir);
        throw new Error(
          `Failed to clone theme repository: ${themeRepo}\n${e.message}`,
        );
      }
    } else {
      await fs.writeFile(
        path.join(themeDir, "style.css"),
        `/*\n * Theme Name: ${projectName}\n * Author: Starter CLI\n */\n`,
      );

      await fs.writeFile(
        path.join(themeDir, "index.php"),
        `<?php\n// The main template file\nget_header();\n?>\n<h1>Welcome to ${projectName}</h1>\n<?php\nget_footer();\n`,
      );

      await fs.writeFile(
        path.join(themeDir, "functions.php"),
        `<?php\n// Theme functions\n`,
      );
    }

    await this.#writeWordPressSetupScript(targetDir, ctx);
    await scaffoldGitignore(targetDir, "wordpress");
  }

  async #writeWordPressSetupScript(targetDir: string, ctx: any): Promise<void> {
    if (!ctx.plugins?.length && !ctx.installWpCli) return;

    const scriptsDir = path.join(targetDir, "scripts");
    await fs.ensureDir(scriptsDir);

    const wpCommand =
      ctx.environment === "lando"
        ? "lando wp"
        : "docker compose exec -T -u www-data wordpress wp";
    const lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      ctx.installWpCli && ctx.environment === "docker"
        ? "docker compose exec -T wordpress bash -lc 'command -v wp >/dev/null || (curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp)'"
        : "",
      ...ctx.plugins.map((plugin: string) => `${wpCommand} plugin install ${plugin} --activate`),
      "",
    ].filter(Boolean);

    await fs.writeFile(path.join(scriptsDir, "install-wp-plugins.sh"), `${lines.join("\n")}\n`, {
      mode: 0o755,
    });
  }

  override getTemplateType(): string {
    return "wordpress";
  }
}

function normalizePlugins(plugins: unknown): string[] {
  if (Array.isArray(plugins)) return plugins;
  if (typeof plugins === "string") {
    return plugins
      .split(",")
      .map((plugin) => plugin.trim())
      .filter(Boolean);
  }
  return [];
}
