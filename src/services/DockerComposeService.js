import EnvironmentService from "./EnvironmentService.js";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage } from "../utils/templateMap.js";
import { execAsync } from "../utils/execAsync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class DockerComposeService extends EnvironmentService {
  async scaffold(targetDir, type, options, spinner = null) {
    const { projectName, mysqlVersion, wpVersion, tablePrefix } = options;
    const templateName = resolveTemplateName(type);

    const templatePath = path.join(
      __dirname,
      "..",
      "templates",
      "docker",
      `${templateName}.yaml.tpl`,
    );
    let content = await fs.readFile(templatePath, "utf-8");

    if (mysqlVersion) {
      content = content.replace(/{{DB_IMAGE}}/g, resolveDbImage(mysqlVersion));
    }

    if (wpVersion) {
      const wpImageTag = wpVersion === "latest" ? "latest" : wpVersion;
      content = content.replace(/{{WP_VERSION}}/g, wpImageTag);
    }

    const tablePrefixValue = tablePrefix || "wp_";
    content = content.replace(/{{TABLE_PREFIX}}/g, tablePrefixValue);

    content = content.replace(/{{PROJECT_NAME}}/g, projectName);

    await fs.writeFile(path.join(targetDir, "docker-compose.yaml"), content);
  }

  async start(targetDir, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`Docker Compose: ${line}`) : null;
    await execAsync("docker compose up -d", { cwd: targetDir }, onProgress);
  }

  async isDbReady(targetDir) {
    try {
      await execAsync(
        `docker compose exec -T db sh -c '(mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null)'`,
        { cwd: targetDir }
      );
      return true;
    } catch {
      return false;
    }
  }

  async waitForDb(targetDir, timeoutSeconds = 60, spinner = null) {
    if (spinner) spinner.message("Waiting for database to be ready...");
    let waited = 0;
    while (!(await this.isDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        if (spinner) spinner.message(chalk.red(`Database did not become ready after ${timeoutSeconds}s, proceeding anyway...`));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      waited += 2;
      if (spinner) spinner.message(`Waiting for database... ${waited}s`);
    }
  }

  async ensureWpCli(targetDir, spinner = null) {
    try {
      if (spinner) spinner.message("Installing WP-CLI...");
      await execAsync(
        'docker compose exec -T wordpress bash -c "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"',
        { cwd: targetDir }
      );
    } catch (e) {
      if (spinner) spinner.message(chalk.red(`Failed to install WP-CLI inside the docker container.`));
    }
  }

  async importDb(targetDir, sqlFile, spinner = null) {
    await this.waitForDb(targetDir, 60, spinner);
    await this.ensureWpCli(targetDir, spinner);

    const onProgress = spinner ? (line) => spinner.message(`Importing DB: ${line}`) : null;

    if (spinner) spinner.message("Copying DB to container...");
    await execAsync(`docker compose cp ${sqlFile} db:/tmp/${sqlFile}`, { cwd: targetDir });

    await execAsync(
      `docker compose exec -T db sh -c '{ echo "[client]"; echo "user=$MYSQL_USER"; echo "password=$MYSQL_PASSWORD"; } > /tmp/my.cnf && (mariadb --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile} 2>/dev/null || mysql --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile}) && rm /tmp/my.cnf'`,
      { cwd: targetDir },
      onProgress
    );
  }

  async searchReplace(targetDir, from, to, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`Search-Replace: ${line}`) : null;
    await execAsync(
      `docker compose exec -T -u www-data wordpress wp search-replace '${from}' '${to}'`,
      { cwd: targetDir },
      onProgress
    );
  }

  async runWpCommand(targetDir, command, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`WP-CLI: ${line}`) : null;
    await execAsync(`docker compose exec -T -u www-data wordpress wp ${command}`, {
      cwd: targetDir
    }, onProgress);
  }
}
