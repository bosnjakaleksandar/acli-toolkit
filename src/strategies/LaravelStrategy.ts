import BaseStrategy from "./BaseStrategy.ts";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../utils/git.js";
import { hasCommand, runCommand } from "../utils/commandRunner.ts";
import type EnvironmentService from "../services/EnvironmentService.ts";
import type { ScaffoldStrategy } from "../core/registry/ProjectTypeRegistry.ts";

type Runner = typeof runCommand;

export default class LaravelStrategy extends BaseStrategy {
  frontendStrategy: ScaffoldStrategy;
  run: Runner;

  constructor(envService: EnvironmentService | null, frontendStrategy: ScaffoldStrategy, { runner = runCommand }: { runner?: Runner } = {}) {
    super(envService);
    this.frontendStrategy = frontendStrategy;
    this.run = runner;
  }

  override async askQuestions(ctx: any, options: { nonInteractive?: boolean } = {}): Promise<any> {
    return await this.frontendStrategy.askQuestions?.(ctx, options);
  }

  override async scaffold(targetDir: string, ctx: any): Promise<void> {
    const { projectName } = ctx;

    const frontendDir = path.join(targetDir, "frontend");
    await fs.ensureDir(frontendDir);
    await this.frontendStrategy.scaffold(frontendDir, ctx);

    if (!hasCommand("composer")) {
      throw new Error(
        "Composer is required to generate a Laravel application. Install Composer and run this command again.",
      );
    }

    await this.run("composer", ["create-project", "laravel/laravel", "backend"], {
      cwd: targetDir,
    });

    await fs.writeFile(
      path.join(targetDir, "README.md"),
      `# ${projectName}\n\nThis is a full-stack Laravel + ${ctx.framework} project.\n\n## Backend\n\`cd backend && php artisan serve\`\n\n## Frontend\n\`cd frontend\`, install dependencies, then run its dev script. Point it at the backend's API URL (\`http://localhost:8000\` by default).\n`,
    );

    await scaffoldGitignore(targetDir, "laravel");
  }
}
