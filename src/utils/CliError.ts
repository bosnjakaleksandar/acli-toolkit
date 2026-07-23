export interface CliErrorOptions {
  code?: string;
  hint?: string;
  exitCode?: number;
}

export class CliError extends Error {
  code: string;
  hint: string;
  exitCode: number;

  constructor(message: string, { code = "CLI_ERROR", hint = "", exitCode = 1 }: CliErrorOptions = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

export class TargetExistsError extends CliError {
  targetDir: string;

  constructor(targetDir: string) {
    super(`Directory "${targetDir}" already exists.`, {
      code: "TARGET_EXISTS",
      hint: "Choose a different project name or directory.",
    });
    this.targetDir = targetDir;
  }
}

interface ErrorLike {
  stderr?: string;
  stdout?: string;
  message?: string;
}

/**
 * A CommandError's `.message` is just "Command failed: <argv>" — the real
 * diagnostic lives in `.stderr`/`.stdout`. Use this whenever wrapping or
 * displaying an error that might have come from a failed shell command, so
 * the actual cause survives instead of being silently replaced by a
 * useless "Command failed" summary.
 */
export function describeError(error: unknown): string {
  const err = error as ErrorLike;
  const details = [err?.stderr, err?.stdout].filter(Boolean).join("\n").trim();
  return details || err?.message || String(error);
}
