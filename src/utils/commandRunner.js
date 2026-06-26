import { spawn, spawnSync } from "child_process";

/**
 * Error thrown when a child process exits unsuccessfully.
 */
export class CommandError extends Error {
  constructor(command, args, result) {
    const stderr = result.stderr?.toString?.() || result.stderr || "";
    const stdout = result.stdout?.toString?.() || result.stdout || "";
    super(`Command failed: ${[command, ...args].join(" ")}`);
    this.name = "CommandError";
    this.command = command;
    this.args = args;
    this.code = result.status ?? result.code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Runs a command without a shell and resolves with stdout.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Command arguments.
 * @param {object} options spawn options.
 * @param {(line: string) => void} [onProgress] Progress callback.
 * @returns {Promise<string>}
 */
export async function runCommand(command, args = [], options = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      emitProgress(text, onProgress);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      emitProgress(text, onProgress);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

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
 *
 * @param {string} command Executable name.
 * @param {string[]} args Command arguments.
 * @param {object} options spawnSync options.
 * @returns {import("child_process").SpawnSyncReturns<Buffer>}
 */
export function runCommandSync(command, args = [], options = {}) {
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
 *
 * @param {string} command Executable name.
 * @returns {boolean}
 */
export function hasCommand(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: false,
  });

  return !result.error && result.status === 0;
}

function emitProgress(text, onProgress) {
  if (!onProgress) return;
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1]?.trim();
  if (lastLine) onProgress(lastLine);
}
