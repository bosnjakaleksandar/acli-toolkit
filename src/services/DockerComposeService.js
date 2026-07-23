import EnvironmentService from "./EnvironmentService.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage } from "../utils/templateMap.js";
import { runCommand } from "../utils/commandRunner.ts";
import { CliError, describeError } from "../utils/CliError.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Matches both the raw MySQL/MariaDB client's auth failure (seen during the
// direct SQL import, which authenticates as root) and WordPress's own
// connection-error message (seen when wp-cli/wp-config.php authenticates as
// the app user). A persistent db_data volume from an older run — e.g. one
// created before a template's credentials changed — can leave the app
// user's password stale even though root (used for the SQL import itself)
// still works, so the import step alone can succeed while wp-cli's later
// connection attempt fails. Recovering on either symptom catches both cases.
const STALE_CREDENTIALS_PATTERN = /ERROR\s+1045|access denied|error establishing a database connection/i;

export default class DockerComposeService extends EnvironmentService {
  constructor({ runner = runCommand } = {}) {
    super();
    this.run = runner;
  }

  getLocalUrl(ctx) { return ctx.profile?.local?.url || "http://localhost:8080"; }

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
    await this.run("docker", ["compose", "up", "-d"], { cwd: targetDir }, onProgress);
  }

  async isDbReady(targetDir) {
    try {
      await this.run("docker", ["compose", "exec", "-T", "db", "sh", "-c", '(mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null)'], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async waitForDb(targetDir, { timeoutSeconds = 60 } = {}, spinner = null) {
    spinner?.message("Waiting for database to be ready...");
    let waited = 0;
    while (!(await this.isDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        throw new CliError(`Database did not become ready after ${timeoutSeconds}s.`, {
          code: "DB_NOT_READY",
          hint: "Run `docker compose logs db` to see why the database container did not come up, then retry.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      waited += 2;
      spinner?.message(`Waiting for database... ${waited}s`);
    }
  }

  // isDbReady() connects as root over a unix socket from *inside* the db
  // container — during the MySQL/MariaDB image's entrypoint init, a
  // temporary socket-only server accepts exactly that kind of connection
  // before the real server is listening on TCP for other containers to
  // reach. So isDbReady() (and anything gated only on it) can report success
  // while WordPress — which connects over TCP, as the app user, from the
  // wordpress container — still can't get in. This probes that exact path.
  async isAppDbReady(targetDir) {
    const phpCode = 'mysqli_report(MYSQLI_REPORT_OFF); $c = @mysqli_connect(getenv("WORDPRESS_DB_HOST"), getenv("WORDPRESS_DB_USER"), getenv("WORDPRESS_DB_PASSWORD"), getenv("WORDPRESS_DB_NAME")); exit($c ? 0 : 1);';
    try {
      await this.run("docker", ["compose", "exec", "-T", "wordpress", "php", "-r", phpCode], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async waitForAppDb(targetDir, { timeoutSeconds = 120, pollIntervalMs = 2000 } = {}, spinner = null) {
    spinner?.message("Waiting for WordPress to reach the database over the network...");
    let waited = 0;
    while (!(await this.isAppDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        throw new CliError(`WordPress could not reach the database over the network after ${timeoutSeconds}s.`, {
          code: "APP_DB_NOT_READY",
          hint: "Run `docker compose logs db wordpress` to see why, then retry.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs / 1000;
      spinner?.message(`Waiting for WordPress to reach the database... ${waited}s`);
    }
  }

  async ensureWpCli(targetDir, spinner = null) {
    spinner?.message("Installing WP-CLI...");
    try {
      await this.run("docker", ["compose", "exec", "-T", "wordpress", "bash", "-c", "curl -fsSL -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"], { cwd: targetDir });
    } catch (error) {
      throw new CliError(`Failed to install WP-CLI inside the Docker container: ${describeError(error)}`, {
        code: "WP_CLI_INSTALL_FAILED",
        hint: "Check the container's network access (it needs to reach raw.githubusercontent.com), then retry.",
      });
    }
  }

  async importDb(targetDir, sqlFile, spinner = null) {
    await this.waitForDb(targetDir, {}, spinner);
    await this.waitForAppDb(targetDir, {}, spinner);
    await this.ensureWpCli(targetDir, spinner);

    try {
      await this.#importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    } catch (error) {
      const details = `${error?.stderr || ""}\n${error?.stdout || ""}\n${error?.message || ""}`;
      if (!STALE_CREDENTIALS_PATTERN.test(details)) throw error;

      await this.recoverDb(targetDir, spinner);
      await this.#importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    }
  }

  // The raw SQL import authenticates as root, which a stale db_data volume's
  // password never affects — so it can succeed even when the app user's
  // credentials (used by wp-config.php, and therefore every wp-cli command)
  // are stale. This surfaces that mismatch immediately, inside the same
  // try/catch as the import, so the existing stale-credential recovery
  // catches it too instead of it resurfacing later with no recovery path.
  // Deliberately `option get` (goes through $wpdb/PHP's own mysqli
  // extension), not `wp db check`/`db export` — those shell out to the
  // mysql/mysqlcheck/mysqldump *binaries*, which the official wordpress
  // image does not include, so they fail with "command not found"
  // regardless of whether the DB connection itself is fine. --debug still
  // surfaces the actual underlying PHP/mysqli error when it isn't.
  async #verifyDbConnection(targetDir, spinner = null) {
    spinner?.message("Verifying WordPress can connect to the imported database...");
    await this.wp(targetDir, ["option", "get", "siteurl", "--debug"], spinner);
  }

  async recoverDb(targetDir, spinner = null) {
    spinner?.message("Local database credentials are stale; rebuilding the generated DB volume...");
    // `down --volumes` only removes the *named* db_data volume — it has no
    // effect on wp-config.php, which lives on the bind-mounted project
    // directory (`.:/var/www/html`), not in a volume. The official image's
    // entrypoint only ever generates wp-config.php if one doesn't already
    // exist, so a copy left over from an earlier attempt (e.g. one that ran
    // before credentials were unified, or a resumed --keep-dump run) would
    // silently keep its stale values forever, no matter how many times the
    // database volume itself gets wiped. Removing it here forces a fresh,
    // correct one to be generated on the next start.
    await fs.remove(path.join(targetDir, "wp-config.php")).catch(() => {});
    await this.run("docker", ["compose", "down", "--volumes", "--remove-orphans"], { cwd: targetDir });
    await this.start(targetDir, spinner);
    await this.waitForDb(targetDir, {}, spinner);
    // Without this, recovery re-races the exact same startup window that
    // caused the failure in the first place — the retry that follows would
    // fail identically instead of actually recovering.
    await this.waitForAppDb(targetDir, {}, spinner);
    await this.ensureWpCli(targetDir, spinner);
  }

  async #importDbOnce(targetDir, sqlFile, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`Importing DB: ${line}`) : null;

    spinner?.message("Copying DB to container...");
    await this.run("docker", ["compose", "cp", sqlFile, `db:/tmp/${sqlFile}`], { cwd: targetDir });

    await this.run("docker", ["compose", "exec", "-T", "db", "sh", "-c", `{ echo "[client]"; echo "user=root"; echo "password=$MYSQL_ROOT_PASSWORD"; } > /tmp/my.cnf && (mariadb --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile} 2>/dev/null || mysql --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile}); status=$?; rm -f /tmp/my.cnf; exit $status`], { cwd: targetDir }, onProgress);
  }

  async wp(targetDir, args, spinner = null) {
    const onProgress = spinner ? (line) => spinner.message(`WP-CLI: ${line}`) : null;
    return this.run("docker", ["compose", "exec", "-T", "-u", "www-data", "wordpress", "wp", ...args], { cwd: targetDir }, onProgress);
  }

  async searchReplace(targetDir, from, to, spinner = null) {
    return this.wp(targetDir, ["search-replace", from, to, "--all-tables"], spinner);
  }
}
