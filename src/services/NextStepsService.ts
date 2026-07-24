import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { detectPackageManager, installCommand, runScriptCommand, type PackageManager } from "./PackageManagerService.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

export interface NextStepsResult {
  nextSteps: string;
  hasNpm: boolean;
  hasComposer: boolean;
  installDir: string;
  packageManager: PackageManager | null;
}

/**
 * Builds post-scaffold instructions for the generated project.
 */
export async function buildNextSteps(targetDir: string, ctx: ProjectPlan): Promise<NextStepsResult> {
  // Always called after the plan has been fully validated/collected, so
  // projectName is guaranteed present here even though it's optional on the
  // wider ProjectPlan type (which also describes pre-validation states).
  const projectName = ctx.projectName!;
  const { setupType, appType, environment, projectType } = ctx;
  let nextSteps = `  cd ${projectName}\n`;
  let installDir = targetDir;
  let packageManager = await detectPackageManager(targetDir, ctx.packageManager);
  let hasPackageDependencies = false;

  if (setupType === "existing-wp") {
    nextSteps += `  ${chalk.gray(`# ${environment === "docker" ? "Docker" : "Lando"} environment is already running`)}\n`;
    const themeInfo = await appendThemeSteps(targetDir, projectName);
    nextSteps += themeInfo.nextSteps;
    installDir = themeInfo.installDir || installDir;
    hasPackageDependencies = themeInfo.hasNpm;
    if (themeInfo.packageManager) packageManager = themeInfo.packageManager;
  } else if (appType === "wordpress") {
    nextSteps += environment === "docker" ? `  docker compose up -d\n` : `  lando start\n`;
    if (await fs.pathExists(path.join(targetDir, "scripts", "install-wp-plugins.sh"))) {
      nextSteps += `  ./scripts/install-wp-plugins.sh\n`;
    }
    const themeInfo = await appendThemeSteps(targetDir, projectName);
    nextSteps += themeInfo.nextSteps;
    installDir = themeInfo.installDir || installDir;
    hasPackageDependencies = themeInfo.hasNpm;
    if (themeInfo.packageManager) packageManager = themeInfo.packageManager;

    if (!themeInfo.hasNpm && !themeInfo.hasComposer && ctx.themeRepo) {
      nextSteps += `  cd wp-content/themes/${projectName}\n`;
      nextSteps += `  npm install && npm run dev ${chalk.gray("(if required)")}\n`;
      installDir = path.join(targetDir, "wp-content", "themes", projectName);
      hasPackageDependencies = true;
    }
  } else {
    // Application projects (React/Next.js/Laravel) run via their own dev
    // servers — no docker-compose.yaml/.lando.yml is scaffolded for them.
    if (ctx.useLaravel) {
      nextSteps += `  ${chalk.gray("# Backend (Laravel)")}\n`;
      nextSteps += `  cd backend && php artisan serve\n`;
    }

    if (projectType === "nextjs" || projectType === "react") {
      if (ctx.useLaravel) {
        nextSteps += `  ${chalk.gray("# Frontend (new terminal)")}\n`;
        nextSteps += `  cd ${projectName}/frontend\n`;
        installDir = path.join(targetDir, "frontend");
      }
      nextSteps += `  ${installCommand(packageManager)}\n`;
      nextSteps += `  ${runScriptCommand(packageManager, "dev")}\n`;
      hasPackageDependencies = true;
    }
  }

  nextSteps = nextSteps.replace(/\n$/, "");

  return {
    nextSteps,
    hasNpm: hasPackageDependencies,
    hasComposer: nextSteps.includes("composer install"),
    installDir,
    packageManager,
  };
}

async function appendThemeSteps(targetDir: string, projectName: string) {
  const themeDir = path.join(targetDir, "wp-content", "themes", projectName);
  const hasPkg = await fs.pathExists(path.join(themeDir, "package.json"));
  const hasComposer = await fs.pathExists(path.join(themeDir, "composer.json"));
  let nextSteps = "";
  let packageManager: PackageManager | null = null;

  if (hasPkg || hasComposer) {
    nextSteps += `  cd wp-content/themes/${projectName}\n`;
    if (hasComposer) nextSteps += `  composer install\n`;
    if (hasPkg) {
      packageManager = await detectPackageManager(themeDir);
      nextSteps += `  ${installCommand(packageManager)}\n`;
      nextSteps += `  ${runScriptCommand(packageManager, "dev")}\n`;
    }
  }

  return {
    nextSteps,
    hasNpm: hasPkg,
    hasComposer,
    installDir: hasPkg || hasComposer ? themeDir : null,
    packageManager,
  };
}
