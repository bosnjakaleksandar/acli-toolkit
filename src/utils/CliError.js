export class CliError extends Error {
  constructor(message, { code = "CLI_ERROR", hint = "", exitCode = 1 } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

export class TargetExistsError extends CliError {
  constructor(targetDir) {
    super(`Directory "${targetDir}" already exists.`, {
      code: "TARGET_EXISTS",
      hint: "Choose a different project name or directory.",
    });
    this.targetDir = targetDir;
  }
}

/**
 * A CommandError's `.message` is just "Command failed: <argv>" — the real
 * diagnostic lives in `.stderr`/`.stdout`. Use this whenever wrapping or
 * displaying an error that might have come from a failed shell command, so
 * the actual cause survives instead of being silently replaced by a
 * useless "Command failed" summary.
 */
export function describeError(error) {
  const details = [error?.stderr, error?.stdout].filter(Boolean).join("\n").trim();
  return details || error?.message || String(error);
}
