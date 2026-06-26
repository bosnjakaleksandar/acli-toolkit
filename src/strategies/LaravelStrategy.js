import BaseStrategy from "./BaseStrategy.js";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../utils/git.js";
import { hasCommand, runCommand } from "../utils/commandRunner.js";

export default class LaravelStrategy extends BaseStrategy {
  constructor(envService, frontendStrategy) {
    super(envService);
    this.frontendStrategy = frontendStrategy;
  }

  async askQuestions(ctx) {
    return await this.frontendStrategy.askQuestions(ctx);
  }

  async scaffold(targetDir, ctx) {
    if (!ctx.skipEnvironment) {
      await this.scaffoldEnvironment(targetDir, ctx);
    }

    const { projectName } = ctx;

    const backendDir = path.join(targetDir, "backend");
    const frontendDir = path.join(targetDir, "frontend");

    await fs.ensureDir(frontendDir);

    const frontendCtx = { ...ctx, isFullStack: true, skipEnvironment: true };
    await this.frontendStrategy.scaffold(frontendDir, frontendCtx);

    if (!hasCommand("composer")) {
      throw new Error(
        "Composer is required to generate a Laravel application. Install Composer and run this command again.",
      );
    }

    await runCommand("composer", ["create-project", "laravel/laravel", "backend"], {
      cwd: targetDir,
    });

    await fs.writeFile(
      path.join(targetDir, "README.md"),
      `# ${projectName}\n\nThis is a full-stack Laravel + ${ctx.framework} project.\n\n## Backend\nNavigate to \`backend/\` to view the Laravel app.\n\n## Frontend\nNavigate to \`frontend/\` to view the UI application. It is pre-configured to communicate with the Laravel backend API.\n`,
    );

    await scaffoldGitignore(targetDir, "laravel");
  }

  getTemplateType() {
    return "laravel";
  }
}
