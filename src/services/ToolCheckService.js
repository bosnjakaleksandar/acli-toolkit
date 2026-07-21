import { spawnSync } from "node:child_process";

// Shared catalog of external tool checks used by `doctor`, pre-create
// preflight, and remote-profile preflight. Centralized so all three agree on
// how to detect a tool (e.g. "docker" means Docker Compose v2, not just the
// docker binary) instead of drifting into inconsistent bare-command checks.
export const TOOL_CATALOG = {
  node: { label: "Node.js", command: "node", args: ["--version"], fix: "Install Node.js 20 or newer." },
  npm: { label: "npm", command: "npm", args: ["--version"], fix: "Install npm with Node.js." },
  git: { label: "Git", command: "git", args: ["--version"], fix: "Install Git and add it to PATH." },
  docker: { label: "Docker Compose", command: "docker", args: ["compose", "version"], fix: "Install Docker with Compose v2." },
  lando: { label: "Lando", command: "lando", args: ["--version"], fix: "Install Lando." },
  composer: { label: "Composer", command: "composer", args: ["--version"], fix: "Install Composer for Laravel generation." },
  php: { label: "PHP", command: "php", args: ["--version"], fix: "Install PHP 8.2 or newer." },
  ssh: { label: "SSH", command: "ssh", args: ["-V"], fix: "Install OpenSSH." },
  rsync: { label: "rsync", command: "rsync", args: ["--version"], fix: "Install rsync for the selected profile." },
  scp: { label: "SCP", command: "scp", args: ["-V"], fix: "Install an SCP client for the selected profile." },
};

export function checkTool(key) {
  const check = TOOL_CATALOG[key];
  if (!check) return null;
  const result = spawnSync(check.command, check.args, { encoding: "utf8", shell: false });
  const output = result.stdout?.trim() || result.stderr?.trim() || "";
  return { key, ...check, ok: !result.error && result.status === 0, version: output.split("\n")[0] };
}

export function toolExists(key) {
  return Boolean(checkTool(key)?.ok);
}
