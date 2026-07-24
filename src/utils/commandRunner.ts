import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";

interface CommandResultLike {
  status?: number | null;
  code?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
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
    super(`Command failed: ${[command, ...args].join(" ")}`);
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
  if (process.env.ACLI_VERBOSE === "1" || process.env.ACLI_DEBUG === "1") console.error(`> ${[command, ...args].join(" ")}`);
  return new Promise((resolve, reject) => {
    const { encoding = "utf8", ...spawnOptions } = options;
    const child = spawn(command, args, {
      shell: false,
      ...spawnOptions,
    });

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
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    ...options,
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
