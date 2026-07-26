import EnvironmentService, { type Spinner } from "./EnvironmentService.ts";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage } from "./templateMap.ts";
import { assertSafeTablePrefix, assertSafeWpVersion } from "../system/safety.ts";
import { runCommand } from "../system/commandRunner.ts";
import { CliError, describeError } from "../core/errors.ts";
import { applyPlaceholders, readTemplate } from "./renderTemplate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

type Runner = typeof runCommand;

export default class DockerComposeService extends EnvironmentService {
  run: Runner;

  constructor({ runner = runCommand }: { runner?: Runner } = {}) {
    super();
    this.run = runner;
  }

  getLocalUrl(ctx: any): string { return ctx.profile?.local?.url || "http://localhost:8080"; }

  async scaffold(targetDir: string, type: string, options: any, spinner: Spinner | null = null): Promise<void> {
    const { projectName, mysqlVersion, wpVersion, tablePrefix } = options;
    const templateName = resolveTemplateName(type);
    const content = applyPlaceholders(await readTemplate(TEMPLATES_ROOT, "docker", templateName), {
      DB_IMAGE: mysqlVersion ? resolveDbImage(mysqlVersion) : undefined,
      WP_VERSION: wpVersion ? assertSafeWpVersion(wpVersion) : undefined,
      TABLE_PREFIX: assertSafeTablePrefix(tablePrefix || "wp_"),
      PROJECT_NAME: projectName,
    });
    await fs.writeFile(path.join(targetDir, "docker-compose.yaml"), content);
  }

  async start(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Docker Compose: ${line}`) : null;
    await this.run("docker", ["compose", "up", "-d"], { cwd: targetDir }, onProgress);
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
      await this.run("docker", ["compose", "exec", "-T", "wordpress", "bash", "-c", "curl -fsSL -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"], { cwd: targetDir });
    } catch (error) {
      throw new CliError(`Failed to install WP-CLI inside the Docker container: ${describeError(error)}`, {
        code: "WP_CLI_INSTALL_FAILED",
        hint: "Check the container's network access (it needs to reach raw.githubusercontent.com), then retry.",
      });
    }
  }

  async recoverDb(targetDir: string, spinner: Spinner | null = null): Promise<void> {
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

  protected async importDbOnce(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Importing DB: ${line}`) : null;

    spinner?.message("Copying DB to container...");
    await this.run("docker", ["compose", "cp", sqlFile, `db:/tmp/${sqlFile}`], { cwd: targetDir });

    await this.run("docker", ["compose", "exec", "-T", "db", "sh", "-c", `{ echo "[client]"; echo "user=root"; echo "password=$MYSQL_ROOT_PASSWORD"; } > /tmp/my.cnf && (mariadb --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile} 2>/dev/null || mysql --defaults-file=/tmp/my.cnf "$MYSQL_DATABASE" < /tmp/${sqlFile}); status=$?; rm -f /tmp/my.cnf; exit $status`], { cwd: targetDir }, onProgress);
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
