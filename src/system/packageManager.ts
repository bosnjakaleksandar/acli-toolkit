import path from "node:path";
import fs from "fs-extra";

export interface PackageManager {
  name: string;
  lockfile: string;
  install: string[];
  run: string[];
}

const MANAGERS: PackageManager[] = [
  { name: "pnpm", lockfile: "pnpm-lock.yaml", install: ["install"], run: ["run"] },
  { name: "yarn", lockfile: "yarn.lock", install: ["install"], run: [] },
  { name: "npm", lockfile: "package-lock.json", install: ["install"], run: ["run"] },
];

export async function detectPackageManager(directory: string, preferred = ""): Promise<PackageManager> {
  if (preferred) return MANAGERS.find((item) => item.name === preferred) || MANAGERS.at(-1)!;
  let current = directory;
  while (true) {
    for (const manager of MANAGERS) if (await fs.pathExists(path.join(current, manager.lockfile))) return manager;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return MANAGERS.at(-1)!;
}

export function installCommand(manager: PackageManager): string { return `${manager.name} ${manager.install.join(" ")}`; }
export function runScriptCommand(manager: PackageManager, script: string): string { return [manager.name, ...manager.run, script].join(" "); }
