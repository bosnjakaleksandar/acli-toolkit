import { CliError } from "../core/errors.ts";
import { pollUntilReady } from "./readiness.ts";

/** Minimal shape of the @clack/prompts spinner passed through for progress messages. */
export interface Spinner {
  message(text: string): void;
  start?(text?: string): void;
  stop?(text?: string): void;
}

export interface WaitOptions {
  timeoutSeconds?: number;
}

export interface WaitForAppDbOptions extends WaitOptions {
  pollIntervalMs?: number;
}

// Matches both the raw MySQL/MariaDB client's auth failure (seen during the
// direct SQL import, which authenticates as root) and WordPress's own
// connection-error message (seen when wp-cli/wp-config.php authenticates as
// the app user). A persistent db_data volume from an older run — e.g. one
// created before a template's credentials changed — can leave the app
// user's password stale even though root (used for the SQL import itself)
// still works, so the import step alone can succeed while wp-cli's later
// connection attempt fails. Recovering on either symptom catches both cases.
const STALE_CREDENTIALS_PATTERN = /ERROR\s+1045|access denied|error establishing a database connection/i;

/**
 * Contract every local environment adapter (Docker Compose, Lando, ...) must
 * implement in full. Keeping this explicit — rather than duck-typing — is
 * what lets `test/environment-adapter-contract.test.js` assert real parity:
 * a method added to one adapter and forgotten in the other fails that test.
 *
 * `waitForDb`/`waitForAppDb`/`importDb`/`searchReplace` are implemented here
 * once, shared by every adapter — DockerComposeService and LandoService used
 * to hand-roll structurally identical (poll-with-timeout, recover-and-retry)
 * versions of each, which is exactly the kind of duplication that drifts.
 * Adapters customize only what's genuinely tool-specific: the readiness
 * probes themselves, the recovery sequence, the single-shot import command,
 * and (via the protected hooks below) the wording of progress/error
 * messages that reference their own tooling (e.g. "docker compose logs db"
 * vs "lando logs -s database").
 */
export default class EnvironmentService {
  getLocalUrl(ctx: any): string {
    throw new Error("getLocalUrl() not implemented");
  }

  async scaffold(targetDir: string, type: string, options: any, spinner: Spinner | null = null): Promise<void> {
    throw new Error("scaffold() not implemented");
  }

  async start(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("start() not implemented");
  }

  async isDbReady(targetDir: string): Promise<boolean> {
    throw new Error("isDbReady() not implemented");
  }

  /**
   * Polls isDbReady() until ready, throwing (never silently giving up) once
   * timeoutSeconds elapses. Message/hint wording is adapter-specific — see
   * describeDbWaitStart/describeDbWaitTick/dbNotReadyError below.
   */
  async waitForDb(targetDir: string, { timeoutSeconds = 60 }: WaitOptions = {}, spinner: Spinner | null = null): Promise<void> {
    spinner?.message(this.describeDbWaitStart());
    await pollUntilReady({
      probe: () => this.isDbReady(targetDir),
      timeoutSeconds,
      onTick: (waited) => spinner?.message(this.describeDbWaitTick(waited)),
      notReadyError: (seconds) => this.dbNotReadyError(seconds),
    });
  }

  /**
   * True once the *application's own* path to the database — TCP, app
   * credentials, from the app container, exactly like WordPress/wp-cli
   * connect — accepts connections. Deliberately distinct from isDbReady():
   * during a database image's entrypoint init, a temporary socket-only
   * server can accept root/socket connections (what isDbReady checks)
   * before the real server is listening on TCP for the app container to
   * reach. Gating only on isDbReady lets the import race that window.
   */
  async isAppDbReady(targetDir: string): Promise<boolean> {
    throw new Error("isAppDbReady() not implemented");
  }

  /** Polls isAppDbReady() until ready, throwing (never silently giving up) once timeoutSeconds elapses. */
  async waitForAppDb(targetDir: string, { timeoutSeconds = 120, pollIntervalMs = 2000 }: WaitForAppDbOptions = {}, spinner: Spinner | null = null): Promise<void> {
    spinner?.message(this.describeAppDbWaitStart());
    await pollUntilReady({
      probe: () => this.isAppDbReady(targetDir),
      timeoutSeconds,
      pollIntervalMs,
      onTick: (waited) => spinner?.message(this.describeAppDbWaitTick(waited)),
      notReadyError: (seconds) => this.appDbNotReadyError(seconds),
    });
  }

  /** Guarantees `wp` works inside the environment afterward, or throws. */
  async ensureWpCli(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("ensureWpCli() not implemented");
  }

  /**
   * Waits for the DB to be reachable (both the raw and app-user paths — see
   * waitForDb/waitForAppDb), imports `sqlFile`, then verifies WordPress can
   * actually read from it. If that fails with a stale-credentials symptom
   * (STALE_CREDENTIALS_PATTERN), runs the adapter's one-time recovery
   * (recoverDb) and retries exactly once — a second failure propagates.
   */
  async importDb(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    await this.waitForDb(targetDir, {}, spinner);
    await this.waitForAppDb(targetDir, {}, spinner);
    await this.ensureWpCli(targetDir, spinner);

    try {
      await this.importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    } catch (error: any) {
      const details = `${error?.stderr || ""}\n${error?.stdout || ""}\n${error?.message || ""}`;
      if (!STALE_CREDENTIALS_PATTERN.test(details)) throw error;

      await this.recoverDb(targetDir, spinner);
      await this.importDbOnce(targetDir, sqlFile, spinner);
      await this.#verifyDbConnection(targetDir, spinner);
    }
  }

  // Deliberately `option get` (goes through $wpdb/PHP's own mysqli
  // extension), not `wp db check`/`db export` — those shell out to the
  // mysql/mysqlcheck/mysqldump *binaries*, which aren't guaranteed to be
  // present in either adapter's environment, so they can fail with "command
  // not found" regardless of whether the DB connection itself is fine.
  // --debug still surfaces the actual underlying PHP/mysqli error when it isn't.
  async #verifyDbConnection(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Verifying WordPress can connect to the imported database...");
    await this.wp(targetDir, ["option", "get", "siteurl", "--debug"], spinner);
  }

  /** Single-shot database import (no retry/recovery) — the part that's genuinely different per adapter (docker compose cp + exec vs `lando db-import`). */
  protected async importDbOnce(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("importDbOnce() not implemented");
  }

  /** One-time recovery for a stale/mismatched local DB volume (e.g. after a credential change). */
  async recoverDb(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("recoverDb() not implemented");
  }

  /** Runs `wp <args...>` inside the environment and resolves with its stdout. */
  async wp(targetDir: string, args: string[], spinner: Spinner | null = null): Promise<string> {
    throw new Error("wp() not implemented");
  }

  async searchReplace(targetDir: string, from: string, to: string, spinner: Spinner | null = null): Promise<string> {
    return this.wp(targetDir, ["search-replace", from, to, "--all-tables"], spinner);
  }

  protected describeDbWaitStart(): string { return "Waiting for database to be ready..."; }
  protected describeDbWaitTick(waitedSeconds: number): string { return `Waiting for database... ${waitedSeconds}s`; }
  protected dbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`Database did not become ready after ${timeoutSeconds}s.`, { code: "DB_NOT_READY" });
  }

  protected describeAppDbWaitStart(): string { return "Waiting for the application to reach the database over the network..."; }
  protected describeAppDbWaitTick(waitedSeconds: number): string { return `Waiting for the application to reach the database... ${waitedSeconds}s`; }
  protected appDbNotReadyError(timeoutSeconds: number): CliError {
    return new CliError(`The application could not reach the database over the network after ${timeoutSeconds}s.`, { code: "APP_DB_NOT_READY" });
  }
}
