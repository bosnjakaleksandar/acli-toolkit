import EnvironmentService, { type Spinner } from "./EnvironmentService.ts";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTemplateName, resolveDbImage, assertSafeTablePrefix } from "../utils/templateMap.ts";
import { runCommand } from "../utils/commandRunner.ts";
import { CliError, describeError } from "../core/errors.ts";
import { applyPlaceholders, readTemplate } from "./environment/renderTemplate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

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
    const content = applyPlaceholders(await readTemplate(TEMPLATES_ROOT, "lando", templateName), {
      DB_IMAGE: mysqlVersion ? resolveDbImage(mysqlVersion) : undefined,
      TABLE_PREFIX: assertSafeTablePrefix(tablePrefix || "wp_"),
      PROJECT_NAME: projectName,
    });
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

  protected async importDbOnce(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
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

  protected override describeDbWaitStart(): string { return "Waiting for Lando database to be ready..."; }
  protected override describeDbWaitTick(waitedSeconds: number): string { return `Waiting for database... ${waitedSeconds}s`; }
  protected override dbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`Lando database did not become ready after ${timeoutSeconds}s.`, {
      code: "DB_NOT_READY",
      hint: "Run `lando logs -s database` to see why the database service did not come up, then retry.",
    });
  }

  protected override describeAppDbWaitStart(): string { return "Waiting for the Lando appserver to reach the database over the network..."; }
  protected override describeAppDbWaitTick(waitedSeconds: number): string { return `Waiting for the appserver to reach the database... ${waitedSeconds}s`; }
  protected override appDbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`The appserver could not reach the database over the network after ${timeoutSeconds}s.`, {
      code: "APP_DB_NOT_READY",
      hint: "Run `lando logs -s database -s appserver` to see why, then retry.",
    });
  }
}
