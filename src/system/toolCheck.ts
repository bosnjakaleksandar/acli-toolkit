import { spawnSync } from "node:child_process";

export interface ToolCheck {
  label: string;
  command: string;
  args: string[];
  fix: string;
  minimumVersion?: string;
}

export interface ToolCheckResult extends ToolCheck {
  key: string;
  ok: boolean;
  version: string;
}

// Shared catalog of external tool checks used by `doctor`, pre-create
// preflight, and remote-profile preflight. Centralized so all three agree on
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
  scp: { label: "SCP", command: "scp", args: ["-V"], fix: "Install an SCP client for the selected profile." },
};

export function checkTool(key: string): ToolCheckResult | null {
  const check = TOOL_CATALOG[key];
  if (!check) return null;
  const result = spawnSync(check.command, check.args, { encoding: "utf8", shell: false });
  const output = result.stdout?.trim() || result.stderr?.trim() || "";
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

export function toolExists(key: string): boolean {
  return Boolean(checkTool(key)?.ok);
}
