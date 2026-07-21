import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { detectPackageManager, installCommand, runScriptCommand } from "./PackageManagerService.js";

/**
 * Builds post-scaffold instructions for the generated project.
 *
 * @param {string} targetDir Project directory.
 * @param {object} ctx Project context.
 * @returns {Promise<{nextSteps: string, hasNpm: boolean, hasComposer: boolean, installDir: string}>}
 */
export async function buildNextSteps(targetDir, ctx) {
  const { projectName, setupType, appType, environment, projectType } = ctx;
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

async function appendThemeSteps(targetDir, projectName) {
  const themeDir = path.join(targetDir, "wp-content", "themes", projectName);
  const hasPkg = await fs.pathExists(path.join(themeDir, "package.json"));
  const hasComposer = await fs.pathExists(path.join(themeDir, "composer.json"));
  let nextSteps = "";
  let packageManager = null;

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
