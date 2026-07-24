import EnvironmentService, { type Spinner, type WaitOptions, type WaitForAppDbOptions } from "./EnvironmentService.ts";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage } from "../utils/templateMap.ts";
import { runCommand } from "../utils/commandRunner.ts";
import { CliError, describeError } from "../core/errors.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// See DockerComposeService.ts for why this also matches WordPress's own
// connection-error message, not just the raw MySQL/MariaDB client's.
const STALE_CREDENTIALS_PATTERN = /ERROR\s+1045|access denied|error establishing a database connection/i;

type Runner = typeof runCommand;

export default class LandoService extends EnvironmentService {
  run: Runner;

  constructor({ runner = runCommand }: { runner?: Runner } = {}) {
    super();
    this.run = runner;
  }

  getLocalUrl(ctx: any): string { return ctx.profile?.local?.url || `https://${ctx.projectName}.lndo.site`; }

  async scaffold(targetDir: string, type: string, options: any, spinner: Spinner | null = null): Promise<void> {
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

  async start(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Lando: ${line}`) : null;
    await this.run("lando", ["start"], { cwd: targetDir }, onProgress);
  }

  async isDbReady(targetDir: string): Promise<boolean> {
    try {
      await this.run("lando", ["mysql", "-e", "SELECT 1"], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async waitForDb(targetDir: string, { timeoutSeconds = 60 }: WaitOptions = {}, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Waiting for Lando database to be ready...");
    let waited = 0;
    while (!(await this.isDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        throw new CliError(`Lando database did not become ready after ${timeoutSeconds}s.`, {
          code: "DB_NOT_READY",
          hint: "Run `lando logs -s database` to see why the database service did not come up, then retry.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      waited += 2;
      spinner?.message(`Waiting for database... ${waited}s`);
    }
  }

  // See DockerComposeService.ts's isAppDbReady() for why this check (TCP,
  // app credentials, from the appserver) is distinct from isDbReady() (which
  // runs `lando mysql`, against the database service directly) and why
  // gating only on the latter can race a database that isn't actually
  // reachable from the appserver yet.
  async isAppDbReady(targetDir: string): Promise<boolean> {
    const phpCode = 'mysqli_report(MYSQLI_REPORT_OFF); $c = @mysqli_connect(getenv("DB_HOST"), getenv("DB_USER"), getenv("DB_PASSWORD"), getenv("DB_NAME")); exit($c ? 0 : 1);';
    try {
      await this.run("lando", ["ssh", "-s", "appserver", "-c", `php -r '${phpCode}'`], { cwd: targetDir });
      return true;
    } catch {
      return false;
    }
  }

  async waitForAppDb(targetDir: string, { timeoutSeconds = 120, pollIntervalMs = 2000 }: WaitForAppDbOptions = {}, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Waiting for the Lando appserver to reach the database over the network...");
    let waited = 0;
    while (!(await this.isAppDbReady(targetDir))) {
      if (waited >= timeoutSeconds) {
        throw new CliError(`The appserver could not reach the database over the network after ${timeoutSeconds}s.`, {
          code: "APP_DB_NOT_READY",
          hint: "Run `lando logs -s database -s appserver` to see why, then retry.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs / 1000;
      spinner?.message(`Waiting for the appserver to reach the database... ${waited}s`);
    }
  }

  async ensureWpCli(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Verifying WP-CLI...");
    try {
      await this.wp(targetDir, ["--version"], spinner);
    } catch (error) {
      throw new CliError(`WP-CLI is not available inside the Lando app: ${describeError(error)}`, {
        code: "WP_CLI_INSTALL_FAILED",
        hint: "Ensure the Lando recipe includes wp-cli (the default `wordpress` recipe does), then retry.",
      });
    }
  }

  async importDb(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    await this.waitForDb(targetDir, {}, spinner);
    await this.waitForAppDb(targetDir, {}, spinner);
    await this.ensureWpCli(targetDir, spinner);

    try {
      await this.#importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    } catch (error: any) {
      const details = `${error?.stderr || ""}\n${error?.stdout || ""}\n${error?.message || ""}`;
      if (!STALE_CREDENTIALS_PATTERN.test(details)) throw error;

      await this.recoverDb(targetDir, spinner);
      await this.#importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    }
  }

  // Deliberately `option get` (goes through $wpdb/PHP's own mysqli
  // extension), not `wp db check`/`db export` — those shell out to the
  // mysql/mysqlcheck/mysqldump *binaries*, which aren't guaranteed to be on
  // the appserver image, so they can fail with "command not found"
  // regardless of whether the DB connection itself is fine. --debug still
  // surfaces the actual underlying PHP/mysqli error when it isn't.
  async #verifyDbConnection(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Verifying WordPress can connect to the imported database...");
    await this.wp(targetDir, ["option", "get", "siteurl", "--debug"], spinner);
  }

  async recoverDb(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Local database credentials are stale; rebuilding the Lando app...");
    // The recipe's `wp config create` step (see wordpress.yaml.tpl) only
    // runs `if [ ! -f "wp-config.php" ]` — and webroot is the bind-mounted
    // project directory, not a volume, so `lando rebuild` alone won't clear
    // a stale wp-config.php left over from an earlier attempt. Remove it so
    // the rebuild regenerates one with the current credentials.
    await fs.remove(path.join(targetDir, "wp-config.php")).catch(() => {});
    await this.run("lando", ["rebuild", "-y"], { cwd: targetDir });
    await this.waitForDb(targetDir, {}, spinner);
    // Without this, recovery re-races the exact same startup window that
    // caused the failure in the first place.
    await this.waitForAppDb(targetDir, {}, spinner);
    // wp-cli ships with the recipe's image, so unlike Docker's curl-installed
    // binary it should survive a rebuild — this just verifies that promptly
    // with a clear error, instead of a confusing failure showing up later.
    await this.ensureWpCli(targetDir, spinner);
  }

  async #importDbOnce(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    const onProgress = spinner ? (line: string) => spinner.message(`Importing DB: ${line}`) : null;
    await this.run("lando", ["db-import", sqlFile], { cwd: targetDir }, onProgress);
  }

  // --skip-plugins/--skip-themes: every call site here (siteurl reads,
  // search-replace, version checks) is a core/DB-level operation that never
  // needs plugin or theme code loaded. Skipping them avoids bootstrapping a
  // site's full plugin stack just to run wp-cli — on real client databases
  // that stack can be large enough to exhaust PHP's default memory_limit
  // during plugin init, crashing an import that had nothing to do with them.
  async wp(targetDir: string, args: string[], spinner: Spinner | null = null): Promise<string> {
    const onProgress = spinner ? (line: string) => spinner.message(`WP-CLI: ${line}`) : null;
    return (await this.run("lando", ["wp", "--skip-plugins", "--skip-themes", ...args], { cwd: targetDir }, onProgress)) as string;
  }

  async searchReplace(targetDir: string, from: string, to: string, spinner: Spinner | null = null): Promise<string> {
    return this.wp(targetDir, ["search-replace", from, to, "--all-tables"], spinner);
  }
}
