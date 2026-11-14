import EnvironmentService, { type Spinner } from "./EnvironmentService.ts";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { frontendDevServer, resolveTemplateName } from "./templateMap.ts";
import { runtimeTemplateValues } from "./versions.ts";
import { assertSafeTablePrefix, assertSafeWpVersion } from "../system/safety.ts";
import { runCommand } from "../system/commandRunner.ts";
import { CliError, describeError } from "../core/errors.ts";
import { applyPlaceholders, readTemplate } from "./renderTemplate.ts";
import { prepareWpConfigRecovery, restoreWpConfigAfterRecovery } from "../wordpress/migration/wpConfigRecovery.ts";
import { wpCliInstallShell } from "../wordpress/wpCliInstaller.ts";
import { DEFAULT_WORDPRESS_VERSION } from "../config/defaults.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

type Runner = typeof runCommand;

// The official image ships no php.ini, so PHP's built-in 128M memory_limit
// applies to wp-cli — too little for search-replace over a real site's
// postmeta/options. Raised for the local container only.
const WP_CLI_MEMORY_SHELL = "printf 'memory_limit=1024M\\n' > /usr/local/etc/php/conf.d/zz-acli-memory.ini";

export default class DockerComposeService extends EnvironmentService {
  run: Runner;

  constructor({ runner = runCommand }: { runner?: Runner } = {}) {
    super();
    this.run = runner;
  }

  getLocalUrl(ctx: any): string { return ctx.profile?.local?.url || "http://localhost:8080"; }

  async scaffold(targetDir: string, type: string, options: any, spinner: Spinner | null = null): Promise<void> {
    const { projectName, mysqlVersion, phpVersion, wpVersion, tablePrefix, framework } = options;
    const safeWpVersion = assertSafeWpVersion(wpVersion || DEFAULT_WORDPRESS_VERSION);
    const templateName = resolveTemplateName(type);
    const frontend = frontendDevServer(framework);
    const content = applyPlaceholders(await readTemplate(TEMPLATES_ROOT, "docker", templateName), {
      ...runtimeTemplateValues({ mysqlVersion, phpVersion, wpVersion: safeWpVersion }),
      WP_VERSION: safeWpVersion,
      TABLE_PREFIX: assertSafeTablePrefix(tablePrefix || "wp_"),
      PROJECT_NAME: projectName,
      FRONTEND_PORT: frontend.port,
      FRONTEND_DEV_COMMAND: frontend.command,
    });
    await fs.writeFile(path.join(targetDir, "docker-compose.yaml"), content);
  }

  async start(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Docker Compose: ${line}`) : null;
    try {
      await this.run("docker", ["compose", "up", "-d"], { cwd: targetDir }, onProgress);
    } catch (error: any) {
      // The WordPress/database image tags follow the staging server's
      // versions; an old combination (e.g. a WordPress release never built
      // for that PHP) has no published image.
      const details = `${error?.stderr || ""}\n${error?.message || ""}`;
      if (/manifest (?:for \S+ )?(?:unknown|not found)|pull access denied|not found: manifest/i.test(details)) {
        throw new CliError(`A Docker image in docker-compose.yaml does not exist: ${describeError(error)}`, {
          code: "DOCKER_IMAGE_NOT_FOUND",
          hint: "Edit the image tag in docker-compose.yaml (e.g. wordpress:php8.1-apache, mariadb:10.11) or re-run the import with --php / --wp-version / --mysql set to a published combination.",
        });
      }
      throw error;
    }
  }

  async isDbReady(targetDir: string): Promise<boolean> {
    try {
      await this.run("docker", ["compose", "exec", "-T", "db", "sh", "-c", '(mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null) || (mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" 2>/dev/null)'], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  // isDbReady() connects as root over a unix socket from *inside* the db
  // container — during the MySQL/MariaDB image's entrypoint init, a
  // temporary socket-only server accepts exactly that kind of connection
  // before the real server is listening on TCP for other containers to
  // reach. So isDbReady() (and anything gated only on it) can report success
  // while WordPress — which connects over TCP, as the app user, from the
  // wordpress container — still can't get in. This probes that exact path.
  async isAppDbReady(targetDir: string): Promise<boolean> {
    const phpCode = 'mysqli_report(MYSQLI_REPORT_OFF); $c = @mysqli_connect(getenv("WORDPRESS_DB_HOST"), getenv("WORDPRESS_DB_USER"), getenv("WORDPRESS_DB_PASSWORD"), getenv("WORDPRESS_DB_NAME")); exit($c ? 0 : 1);';
    try {
      await this.run("docker", ["compose", "exec", "-T", "wordpress", "php", "-r", phpCode], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async ensureWpCli(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Installing WP-CLI...");
    try {
      await this.run("docker", ["compose", "exec", "-T", "wordpress", "bash", "-c", `${wpCliInstallShell()}; ${WP_CLI_MEMORY_SHELL}`], { cwd: targetDir });
    } catch (error) {
      throw new CliError(`Failed to install WP-CLI inside the Docker container: ${describeError(error)}`, {
        code: "WP_CLI_INSTALL_FAILED",
        hint: "Check the container's network access (it needs to reach raw.githubusercontent.com), then retry.",
      });
    }
  }

  async recoverDb(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Local database credentials are stale; rebuilding the generated DB volume...");
    const configState = await prepareWpConfigRecovery(targetDir);
    try {
      await this.run("docker", ["compose", "down", "--volumes", "--remove-orphans"], { cwd: targetDir });
      await this.start(targetDir, spinner);
      await this.waitForDb(targetDir, {}, spinner);
      await this.waitForAppDb(targetDir, {}, spinner);
      await restoreWpConfigAfterRecovery(configState);
      await this.ensureWpCli(targetDir, spinner);
    } catch (error) {
      await restoreWpConfigAfterRecovery(configState).catch(() => {});
      throw error;
    }
  }

  protected async importDbOnce(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Importing DB: ${line}`) : null;

    spinner?.message("Copying DB to container...");
    const containerSqlFile = path.posix.basename(sqlFile);
    if (!/^[a-zA-Z0-9._-]+$/.test(containerSqlFile)) throw new Error(`Unsafe SQL filename: ${sqlFile}`);
    await this.run("docker", ["compose", "cp", sqlFile, `db:/tmp/${containerSqlFile}`], { cwd: targetDir });

    await this.run("docker", ["compose", "exec", "-T", "db", "sh", "-c", `trap 'rm -f /tmp/my.cnf /tmp/${containerSqlFile}' EXIT; { echo "[client]"; echo "user=root"; echo "password=$MYSQL_ROOT_PASSWORD"; echo "max_allowed_packet=1G"; } > /tmp/my.cnf && if command -v mariadb >/dev/null 2>&1; then client=mariadb; else client=mysql; fi && "$client" --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${containerSqlFile}`], { cwd: targetDir }, onProgress);
  }

  // --skip-plugins/--skip-themes: every call site here (siteurl reads,
  // search-replace, version checks) is a core/DB-level operation that never
  // needs plugin or theme code loaded. Skipping them avoids bootstrapping a
  // site's full plugin stack just to run wp-cli — on real client databases
  // that stack can be large enough to exhaust PHP's default memory_limit
  // during plugin init, crashing an import that had nothing to do with them.
  async wp(targetDir: string, args: string[], spinner: Spinner | null = null): Promise<string> {
    const onProgress = spinner ? (line: string) => spinner.message(`WP-CLI: ${line}`) : null;
    return (await this.run("docker", ["compose", "exec", "-T", "-u", "www-data", "wordpress", "wp", "--skip-plugins", "--skip-themes", ...args], { cwd: targetDir }, onProgress)) as string;
  }

  protected override describeDbWaitStart(): string { return "Waiting for database to be ready..."; }
  protected override describeDbWaitTick(waitedSeconds: number): string { return `Waiting for database... ${waitedSeconds}s`; }
  protected override dbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`Database did not become ready after ${timeoutSeconds}s.`, {
      code: "DB_NOT_READY",
      hint: "Run `docker compose logs db` to see why the database container did not come up, then retry.",
    });
  }

  protected override describeAppDbWaitStart(): string { return "Waiting for WordPress to reach the database over the network..."; }
  protected override describeAppDbWaitTick(waitedSeconds: number): string { return `Waiting for WordPress to reach the database... ${waitedSeconds}s`; }
  protected override appDbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`WordPress could not reach the database over the network after ${timeoutSeconds}s.`, {
      code: "APP_DB_NOT_READY",
      hint: "Run `docker compose logs db wordpress` to see why, then retry.",
    });
  }
}
