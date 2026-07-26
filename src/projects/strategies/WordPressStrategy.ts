import BaseStrategy from "./ScaffoldStrategy.ts";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../../system/gitignore.ts";
import { runCommand } from "../../system/commandRunner.ts";
import { isSafeGitUrl, isSafeSshKeyPath, redactUrlCredentials } from "../../system/safety.ts";
import { askWordPressQuestions, normalizePlugins } from "../prompts/wordpressPrompts.ts";
import { writeWordPressSetupScript } from "./wordpressSetupScript.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

export default class WordPressStrategy extends BaseStrategy {
  override async askQuestions(ctx: ProjectPlan, options?: { nonInteractive?: boolean }): Promise<ProjectPlan> {
    return askWordPressQuestions(ctx, options);
  }

  override async scaffold(targetDir: string, ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    if (!ctx.skipEnvironment) {
      await this.scaffoldEnvironment(targetDir, ctx, spinner);
    }

    const { projectName, themeRepo, themeBranch } = ctx;
    const themeDir = path.join(targetDir, "wp-content", "themes", projectName!);
    await fs.ensureDir(themeDir);

    if (themeRepo) {
      console.log(
        chalk.cyan(
          `\nCloning theme from ${redactUrlCredentials(themeRepo)}${themeBranch ? ` (${themeBranch})` : ""}...`,
        ),
      );
      try {
        let envVars = { ...process.env };
        if (ctx.sshKeyPath) {
          const resolvedKeyPath = ctx.sshKeyPath.replace(
            /^~/,
            process.env.HOME || "",
          );
          // git executes GIT_SSH_COMMAND through a shell, so an unquoted
          // key path with shell metacharacters (or one crafted to look like
          // an extra ssh option) would be interpreted rather than passed
          // through literally. Reject anything but a plain path up front.
          if (!isSafeSshKeyPath(resolvedKeyPath)) {
            throw new Error(`Unsafe SSH key path: ${resolvedKeyPath}`);
          }
          envVars.GIT_SSH_COMMAND = `ssh -i ${resolvedKeyPath} -o IdentitiesOnly=yes`;
        }

        if (!isSafeGitUrl(themeRepo)) throw new Error(`Unsafe theme repository URL: ${themeRepo}`);

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
          `Failed to clone theme repository: ${redactUrlCredentials(themeRepo)}\n${redactUrlCredentials(e.message)}`,
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

    await writeWordPressSetupScript(targetDir, ctx);
    await scaffoldGitignore(targetDir, "wordpress");
  }

  override getTemplateType(): string {
    return "wordpress";
  }
}

export { normalizePlugins };
