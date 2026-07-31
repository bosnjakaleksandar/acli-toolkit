import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { redactUrlCredentials } from "./safety.ts";

interface CommandResultLike {
  status?: number | null;
  code?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

// Matches a credential value concatenated (no space) directly onto a known
// secret-bearing flag/prefix — e.g. mysqldump's `-p<password>` or a
// `MYSQL_PWD=<password>` env-var prefix built into a remote command string.
// Deliberately requires no whitespace before the value so unrelated flags
// that take a *separate* argument (ssh's `-p 2222` for a port) never match.
const SECRET_ARG_PATTERN = /(-p|--password=|MYSQL_PWD=)('[^']*'|"[^"]*"|\S+)/g;

/** Best-effort redaction of known credential patterns from a command line before it's logged or surfaced in an error message. Not a substitute for not passing secrets as process arguments in the first place — see the databaseCommand module's MYSQL_PWD usage — but keeps A-CLI's own diagnostic output from gratuitously repeating a secret that's already unavoidably present in local process argv. Covers both known secret-bearing flags (mysqldump's `-p<password>`, ...) and credentials embedded in a URL argument's userinfo (`scheme://user:pass@host`) — the latter can reach here from any command that takes a URL argument, not just git, so it's redacted here rather than at each call site individually. */
function redactCommandLine(command: string, args: string[]): string {
  const line = [command, ...args].join(" ").replace(SECRET_ARG_PATTERN, (_match, flag) => `${flag}[REDACTED]`);
  return redactUrlCredentials(line);
}

/**
 * Error thrown when a child process exits unsuccessfully.
 */
export class CommandError extends Error {
  command: string;
  args: string[];
  code: number | null | undefined;
  stdout: string;
  stderr: string;

  constructor(command: string, args: string[], result: CommandResultLike) {
    const stderr = result.stderr?.toString?.() || (result.stderr as string) || "";
    const stdout = result.stdout?.toString?.() || (result.stdout as string) || "";
    super(`Command failed: ${redactCommandLine(command, args)}`);
    this.name = "CommandError";
    this.command = command;
    this.args = args;
    this.code = result.status ?? result.code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

interface RunCommandOptions {
  encoding?: BufferEncoding | null;
  /**
   * Data written to the child's stdin, then closed, before this promise
   * resolves. Used by the `direct` remote database driver to
   * deliver the DB password to a remote script that reads it via `read -r`,
   * instead of embedding it in this command's own argv.
   */
  stdin?: string | Buffer;
  [key: string]: unknown;
}

/**
 * Runs a command without a shell and resolves with stdout.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {},
  onProgress: ((line: string) => void) | null = null,
): Promise<string | Buffer> {
  assertCommandPolicy(command, args);
  if (process.env.ACLI_VERBOSE === "1" || process.env.ACLI_DEBUG === "1") console.error(`> ${redactCommandLine(command, args)}`);
  return new Promise((resolve, reject) => {
    const { encoding = "utf8", stdin, ...spawnOptions } = options;
    // shell: false must win over anything in spawnOptions — letting a caller
    // override it would let args (which may contain shell metacharacters,
    // e.g. an untrusted path) be interpreted by a shell instead of passed
    // straight to execve().
    const child = spawn(command, args, {
      ...spawnOptions,
      shell: false,
    });

    if (stdin !== undefined) {
      // If the child exits (or closes stdin) before this write finishes —
      // e.g. it fails its own validation immediately — writing to a closed
      // pipe raises EPIPE. That failure surfaces correctly anyway via the
      // child's own non-zero exit below; this just stops it from also
      // becoming an unhandled 'error' event on the stream.
      child.stdin?.on("error", () => {});
      child.stdin?.end(stdin);
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (data) => {
      stdoutChunks.push(Buffer.from(data));
      emitProgress(data.toString("utf8"), onProgress);
    });

    child.stderr?.on("data", (data) => {
      stderrChunks.push(Buffer.from(data));
      emitProgress(data.toString("utf8"), onProgress);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        const output = Buffer.concat(stdoutChunks);
        resolve(encoding === null ? output : output.toString(encoding).trim());
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      reject(
        new CommandError(command, args, {
          status: code,
          stdout,
          stderr,
        }),
      );
    });
  });
}

/**
 * Runs a command synchronously without invoking a shell.
 */
export function runCommandSync(
  command: string,
  args: string[] = [],
  options: Record<string, unknown> = {},
): SpawnSyncReturns<string> {
  assertCommandPolicy(command, args);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    shell: false,
  });

  if (result.error || result.status !== 0) {
    throw new CommandError(command, args, {
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || result.error?.message || "",
    });
  }

  return result;
}

/**
 * Git remotes are read-only from A-CLI's point of view. Keeping this guard in
 * the shared process runner makes the promise architectural rather than a
 * convention at individual call sites: even a future accidental `git push`
 * (or its lower-level `send-pack` equivalent) is rejected before Git starts.
 */
function assertCommandPolicy(command: string, args: string[]): void {
  const executable = command.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase();
  if (executable !== "git" && executable !== "git.exe") return;
  if (!args.some((arg) => arg === "push" || arg === "send-pack")) return;
  throw new Error("A-CLI policy forbids pushing to Git remotes. Commit and push manually when you are ready.");
}

/**
 * Checks whether a binary can be found on PATH.
 */
export function hasCommand(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: false,
  });

  return !result.error && result.status === 0;
}

function emitProgress(text: string, onProgress: ((line: string) => void) | null): void {
  if (!onProgress) return;
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1]?.trim();
  if (lastLine) onProgress(lastLine);
}
