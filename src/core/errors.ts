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

/** Bad CLI input: unknown flag value, malformed --set, etc. */
export class UsageError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    super(message, { ...options, code: "USAGE", exitCode: 2 });
  }
}

/** --yes/--non-interactive supplied without enough flags to skip every prompt. */
export class MissingOptionError extends CliError {
  missing: string[];

  constructor(missing: string[], options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    const label = missing.length === 1 ? "Missing required option" : "Missing required options";
    super(`${label}:\n${missing.map((option) => `- ${option}`).join("\n")}`, { ...options, code: "MISSING_OPTION", exitCode: 2 });
    this.missing = missing;
  }
}

/** Invalid or unparsable configuration file. */
export class ConfigError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    super(message, { ...options, code: "CONFIG_INVALID", exitCode: 3 });
  }
}

/** A required local tool is missing, or a required port is unavailable. */
export class PreflightError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    super(message, { ...options, code: "PREFLIGHT_FAILED", exitCode: 4 });
  }
}

/** SSH/rsync/remote database export/import failures. */
export class RemoteError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    super(message, { ...options, code: "REMOTE_FAILED", exitCode: 5 });
  }
}

/** Docker/Lando scaffold, start, or readiness-wait failures. */
export class EnvironmentError extends CliError {
  constructor(message: string, options: Omit<CliErrorOptions, "code" | "exitCode"> = {}) {
    super(message, { ...options, code: "ENV_FAILED", exitCode: 6 });
  }
}

export class TargetExistsError extends CliError {
  targetDir: string;

  constructor(targetDir: string) {
    super(`Directory "${targetDir}" already exists.`, {
      code: "TARGET_EXISTS",
      hint: "Choose a different project name or directory.",
      exitCode: 7,
    });
    this.targetDir = targetDir;
  }
}

/**
 * Wraps a failed StepRunner step. `.step` names which phase broke; `.resumeCommand`,
 * when present, is what the user should run to continue from that step instead of
 * starting over. The wrapped `.cause` is preserved for `describeError()`.
 */
export class StepFailedError extends CliError {
  step: string;
  resumeCommand?: string;
  stderr?: string;
  stdout?: string;

  constructor(step: string, cause: unknown, { resumeCommand }: { resumeCommand?: string } = {}) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Step "${step}" failed: ${message}`, {
      code: (cause as { code?: string })?.code ?? "STEP_FAILED",
      hint: (cause as { hint?: string })?.hint ?? "",
      exitCode: (cause as { exitCode?: number })?.exitCode ?? 8,
    });
    this.step = step;
    this.resumeCommand = resumeCommand;
    this.cause = cause;
    // Forward the original command's stderr/stdout (if any) so
    // describeError() still surfaces the real shell output instead of
    // just this wrapper's "Step X failed: <message>" summary.
    this.stderr = (cause as { stderr?: string })?.stderr;
    this.stdout = (cause as { stdout?: string })?.stdout;
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
