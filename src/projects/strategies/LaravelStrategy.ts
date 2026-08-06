import ScaffoldStrategy from "./ScaffoldStrategy.ts";
import fs from "fs-extra";
import path from "path";
import { scaffoldGitignore } from "../../system/gitignore.ts";
import { hasCommand, runCommand } from "../../system/commandRunner.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Step } from "../../core/StepRunner.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

type Runner = typeof runCommand;
type HasCommand = typeof hasCommand;

export default class LaravelStrategy extends ScaffoldStrategy {
  frontendStrategy: ScaffoldStrategy;
  run: Runner;
  hasCommand: HasCommand;

  constructor(envService: EnvironmentService | null, frontendStrategy: ScaffoldStrategy, { runner = runCommand, hasCommand: hasCommandCheck = hasCommand }: { runner?: Runner; hasCommand?: HasCommand } = {}) {
    super(envService);
    this.frontendStrategy = frontendStrategy;
    this.run = runner;
    this.hasCommand = hasCommandCheck;
  }

  override async askQuestions(ctx: any, options: { nonInteractive?: boolean } = {}): Promise<any> {
    return await this.frontendStrategy.askQuestions?.(ctx, options);
  }

  override buildScaffoldSteps(targetDir: string, ctx: ProjectPlan): Step[] {
    return [
      {
        id: "scaffold-frontend",
        title: "Creating frontend files",
        run: async () => {
          const frontendDir = path.join(targetDir, "frontend");
          await fs.ensureDir(frontendDir);
          await this.frontendStrategy.scaffold(frontendDir, ctx);
        },
      },
      {
        id: "scaffold-backend",
        title: "Creating Laravel backend",
        run: async () => {
          if (!this.hasCommand("composer")) {
            throw new Error("Composer is required to generate a Laravel application. Install Composer and run this command again.");
          }
          await this.run("composer", ["create-project", "laravel/laravel", "backend"], { cwd: targetDir });
        },
      },
      {
        id: "scaffold-project-files",
        title: "Creating project documentation",
        run: async () => {
          await fs.writeFile(
            path.join(targetDir, "README.md"),
            `# ${ctx.projectName}\n\nThis is a full-stack Laravel + ${ctx.framework} project.\n\n## Backend\n\`cd backend && php artisan serve\`\n\n## Frontend\n\`cd frontend\`, install dependencies, then run its dev script. Point it at the backend's API URL (\`http://localhost:8000\` by default).\n`,
          );
          await scaffoldGitignore(targetDir, "laravel");
        },
      },
    ];
  }

  override async scaffold(targetDir: string, ctx: ProjectPlan): Promise<void> {
    for (const step of this.buildScaffoldSteps(targetDir, ctx)) await step.run();
  }
}
