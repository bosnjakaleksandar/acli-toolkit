import EnvironmentService from "./EnvironmentService.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage } from "../utils/templateMap.js";
import { execAsync } from "../utils/execAsync.js";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class LandoService extends EnvironmentService {
  async scaffold(targetDir, type, options, spinner = null) {
    const { projectName, mysqlVersion, tablePrefix } = options;
    const templateName = resolveTemplateName(type);

    const templatePath = path.join(
      __dirname,
      "..",
      "templates",
      "lando",
      `${templateName}.yaml.tpl`,
    );
    let content = await fs.readFile(templatePath, "utf-8");

    if (mysqlVersion) {
      content = content.replace(/{{DB_IMAGE}}/g, resolveDbImage(mysqlVersion));
    }

    const tablePrefixValue = tablePrefix || "wp_";
    content = content.replace(/{{TABLE_PREFIX}}/g, tablePrefixValue);

    content = content.replace(/{{PROJECT_NAME}}/g, projectName);

    await fs.writeFile(path.join(targetDir, ".lando.yml"), content);
  }

  async start(targetDir, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`Lando: ${line}`) : null;
    await execAsync("lando start", { cwd: targetDir }, onProgress);
  }

  async isDbReady(targetDir) {
    try {
      await execAsync('lando mysql -e "SELECT 1"', { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async waitForDb(targetDir, timeoutSeconds = 60, spinner = null) {
    if (spinner) spinner.message("Waiting for Lando database to be ready...");
    let waited = 0;
    while (!(await this.isDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        if (spinner) spinner.message(chalk.red(`Lando database did not become ready after ${timeoutSeconds}s, proceeding anyway...`));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      waited += 2;
      if (spinner) spinner.message(`Waiting for database... ${waited}s`);
    }
  }

  async importDb(targetDir, sqlFile, spinner = null) {
    await this.waitForDb(targetDir, 60, spinner);
    const onProgress = spinner ? (line) => spinner.message(`Importing DB: ${line}`) : null;
    await execAsync(`lando db-import ${sqlFile}`, { cwd: targetDir }, onProgress);
  }

  async searchReplace(targetDir, from, to, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`Search-Replace: ${line}`) : null;
    await execAsync(`lando wp search-replace '${from}' '${to}'`, { cwd: targetDir }, onProgress);
  }

  async runWpCommand(targetDir, command, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`WP-CLI: ${line}`) : null;
    await execAsync(`lando wp ${command}`, { cwd: targetDir }, onProgress);
  }
}
