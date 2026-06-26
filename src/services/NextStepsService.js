import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

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

  if (setupType === "existing-wp") {
    nextSteps += `  ${chalk.gray(`# ${environment === "docker" ? "Docker" : "Lando"} environment is already running`)}\n`;
    const themeInfo = await appendThemeSteps(targetDir, projectName);
    nextSteps += themeInfo.nextSteps;
    installDir = themeInfo.installDir || installDir;
  } else if (appType === "wordpress") {
    nextSteps += environment === "docker" ? `  docker compose up -d\n` : `  lando start\n`;
    if (await fs.pathExists(path.join(targetDir, "scripts", "install-wp-plugins.sh"))) {
      nextSteps += `  ./scripts/install-wp-plugins.sh\n`;
    }
    const themeInfo = await appendThemeSteps(targetDir, projectName);
    nextSteps += themeInfo.nextSteps;
    installDir = themeInfo.installDir || installDir;

    if (!themeInfo.hasNpm && !themeInfo.hasComposer && ctx.themeRepo) {
      nextSteps += `  cd wp-content/themes/${projectName}\n`;
      nextSteps += `  npm install && npm run dev ${chalk.gray("(if required)")}\n`;
      installDir = path.join(targetDir, "wp-content", "themes", projectName);
    }
  } else {
    nextSteps += environment === "docker" ? `  docker compose up -d\n` : `  lando start\n`;

    if (projectType === "nextjs" || projectType === "react") {
      if (ctx.useLaravel) {
        nextSteps += `  cd frontend\n`;
        installDir = path.join(targetDir, "frontend");
      }
      nextSteps += `  npm install\n`;
      nextSteps += `  npm run dev\n`;
    }
  }

  nextSteps = nextSteps.replace(/\n$/, "");

  return {
    nextSteps,
    hasNpm: nextSteps.includes("npm install"),
    hasComposer: nextSteps.includes("composer install"),
    installDir,
  };
}

async function appendThemeSteps(targetDir, projectName) {
  const themeDir = path.join(targetDir, "wp-content", "themes", projectName);
  const hasPkg = await fs.pathExists(path.join(themeDir, "package.json"));
  const hasComposer = await fs.pathExists(path.join(themeDir, "composer.json"));
  let nextSteps = "";

  if (hasPkg || hasComposer) {
    nextSteps += `  cd wp-content/themes/${projectName}\n`;
    if (hasComposer) nextSteps += `  composer install\n`;
    if (hasPkg) {
      nextSteps += `  npm install\n`;
      nextSteps += `  npm run dev\n`;
    }
  }

  return {
    nextSteps,
    hasNpm: hasPkg,
    hasComposer,
    installDir: hasPkg || hasComposer ? themeDir : null,
  };
}
