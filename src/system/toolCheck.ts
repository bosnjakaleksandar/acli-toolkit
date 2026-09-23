import { spawnSync } from "node:child_process";
import { CliError } from "../core/errors.ts";

export interface ToolCheck {
  label: string;
  command: string;
  args: string[];
  fix: string;
  minimumVersion?: string;
  /** The tool has no version flag (OpenSSH scp): it only has to be startable, whatever its exit status. */
  presenceOnly?: boolean;
}

export interface ToolCheckResult extends ToolCheck {
  key: string;
  ok: boolean;
  version: string;
}

// Shared catalog of external tool checks used by the create/import
// preflight and each remote provider's preflight. Centralized so all three agree on
// how to detect a tool (e.g. "docker" means Docker Compose v2, not just the
// docker binary) instead of drifting into inconsistent bare-command checks.
export const TOOL_CATALOG: Record<string, ToolCheck> = {
  node: { label: "Node.js", command: "node", args: ["--version"], fix: "Install Node.js 22.18 or newer.", minimumVersion: "22.18.0" },
  npm: { label: "npm", command: "npm", args: ["--version"], fix: "Install npm with Node.js." },
  git: { label: "Git", command: "git", args: ["--version"], fix: "Install Git and add it to PATH." },
  docker: { label: "Docker Compose", command: "docker", args: ["compose", "version"], fix: "Install Docker with Compose v2." },
  lando: { label: "Lando", command: "lando", args: ["--version"], fix: "Install Lando." },
  composer: { label: "Composer", command: "composer", args: ["--version"], fix: "Install Composer for Laravel generation." },
  php: { label: "PHP", command: "php", args: ["--version"], fix: "Install PHP 8.2 or newer.", minimumVersion: "8.2.0" },
  ssh: { label: "SSH", command: "ssh", args: ["-V"], fix: "Install OpenSSH." },
  rsync: { label: "rsync", command: "rsync", args: ["--version"], fix: "Install rsync for the selected profile." },
  scp: { label: "SCP", command: "scp", args: [], presenceOnly: true, fix: "Install an SCP client for the selected profile." },
  tar: { label: "tar", command: "tar", args: ["--version"], fix: "Install tar (bundled with macOS, Linux and Windows 10+)." },
};

export function checkTool(key: string): ToolCheckResult | null {
  const check = TOOL_CATALOG[key];
  if (!check) return null;
  const result = spawnSync(check.command, check.args, { encoding: "utf8", shell: false });
  const output = result.stdout?.trim() || result.stderr?.trim() || "";
  if (check.presenceOnly) return { key, ...check, ok: !result.error, version: result.error ? "" : "installed" };
  const version = output.split("\n")[0]!;
  const ok = !result.error && result.status === 0 && (!check.minimumVersion || meetsMinimumVersion(version, check.minimumVersion));
  return { key, ...check, ok, version };
}

export function meetsMinimumVersion(output: string, minimum: string): boolean {
  const found = output.match(/(?:^|\s|v)(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!found) return false;
  const actual = [Number(found[1]), Number(found[2]), Number(found[3] || 0)];
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index]! > required[index]!) return true;
    if (actual[index]! < required[index]!) return false;
  }
  return true;
}

/**
 * Fails with the missing or too-old tools and how to fix each, so a
 * workflow's own preflight is enough — no separate diagnostic command.
 */
export function assertToolsAvailable(keys: string[]): void {
  // A key missing from the catalog can't be checked, so it counts as missing.
  const unknown = (key: string): ToolCheckResult => ({ key, label: key, command: key, args: [], fix: `Install ${key} and add it to PATH.`, ok: false, version: "" });
  const failed = [...new Set(keys)].map((key) => checkTool(key) ?? unknown(key)).filter((result) => !result.ok);
  if (!failed.length) return;
  const describe = (result: ToolCheckResult) => result.version && result.minimumVersion ? `${result.label} (found ${result.version}, need ${result.minimumVersion}+)` : result.label;
  throw new CliError(`Missing or outdated tools: ${failed.map(describe).join(", ")}.`, {
    code: "PREFLIGHT_FAILED",
    hint: failed.map((result) => `${result.label}: ${result.fix}`).join("\n"),
  });
}

export function toolExists(key: string): boolean {
  return Boolean(checkTool(key)?.ok);
}
