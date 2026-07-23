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

/**
 * Contract every local environment adapter (Docker Compose, Lando, ...) must
 * implement in full. Keeping this explicit — rather than duck-typing — is
 * what lets `test/environment-adapter-contract.test.js` assert real parity:
 * a method added to one adapter and forgotten in the other fails that test.
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
   * Polls isDbReady() until ready. MUST throw (not silently give up) once
   * timeoutSeconds elapses — a stack whose database never came up should
   * fail the run loudly instead of continuing into a doomed import.
   */
  async waitForDb(targetDir: string, options: WaitOptions = { timeoutSeconds: 60 }, spinner: Spinner | null = null): Promise<void> {
    throw new Error("waitForDb() not implemented");
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

  /** Polls isAppDbReady() until ready. MUST throw (not silently give up) once timeoutSeconds elapses. */
  async waitForAppDb(targetDir: string, options: WaitForAppDbOptions = { timeoutSeconds: 120, pollIntervalMs: 2000 }, spinner: Spinner | null = null): Promise<void> {
    throw new Error("waitForAppDb() not implemented");
  }

  /** Guarantees `wp` works inside the environment afterward, or throws. */
  async ensureWpCli(targetDir: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("ensureWpCli() not implemented");
  }

  async importDb(targetDir: string, sqlFile: string, spinner: Spinner | null = null): Promise<void> {
    throw new Error("importDb() not implemented");
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
    throw new Error("searchReplace() not implemented");
  }
}
