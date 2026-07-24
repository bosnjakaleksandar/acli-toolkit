import path from "node:path";
import fs from "fs-extra";
import { redactSecrets } from "./ConfigService.ts";
import { trustConfig } from "./ConfigTrustService.ts";
import YAML from "yaml";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

const VERSION = 1;
const LIMIT = 10;
const SAFE_KEYS = new Set(["setupType", "projectName", "projectType", "appType", "framework", "useLaravel", "wpType", "environment", "customizeAdvanced", "mysqlVersion", "wpVersion", "themeRepo", "themeBranch", "plugins", "installWpCli", "skipGitInit", "skipFiles", "skipDatabase", "skipGitLink", "packageManager", "presetName", "stagingUrl", "profile"]);

interface HistoryEntry {
  createdAt: string;
  plan: Record<string, unknown>;
}

interface History {
  version: number;
  entries: HistoryEntry[];
}

export function getHistoryPath(cwd: string = process.cwd()): string { return path.join(cwd, ".acli", "history.json"); }

export async function loadLastPlan({ cwd = process.cwd() }: { cwd?: string } = {}): Promise<Record<string, unknown> | null> {
  const history = await readHistory(cwd);
  return history.entries.at(0)?.plan || null;
}

// `ctx.profile` holds the fully resolved profile object (ssh host, remote
// paths, etc.) once a create run has picked one. Persisting that object into
// history/presets would both leak connection details past redaction and
// produce a plan that can't be reloaded as a profile reference. Only the
// profile's name is safe/round-trippable to keep.
function toSafeCtx(ctx: ProjectPlan): ProjectPlan {
  const profileName = typeof ctx.profile === "string" ? ctx.profile : ctx.profile?.profileName;
  return { ...ctx, profile: profileName };
}

export async function saveSuccessfulPlan(ctx: ProjectPlan, { cwd = process.cwd() }: { cwd?: string } = {}): Promise<string> {
  const filePath = getHistoryPath(cwd);
  const history = await readHistory(cwd);
  const safeCtx = toSafeCtx(ctx);
  const plan = redactSecrets(Object.fromEntries(Object.entries(safeCtx).filter(([key, value]) => SAFE_KEYS.has(key) && value !== undefined))) as Record<string, unknown>;
  history.entries.unshift({ createdAt: new Date().toISOString(), plan });
  history.entries = history.entries.slice(0, LIMIT);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(filePath, history, { spaces: 2, mode: 0o600 });
  return filePath;
}

export async function savePlanAsPreset(name: string, ctx: ProjectPlan, { cwd = process.cwd(), configPath }: { cwd?: string; configPath?: string } = {}): Promise<string> {
  const filePath = configPath ? path.resolve(cwd, configPath) : path.join(cwd, ".acli", "config.yaml");
  let config: { version: number; defaults: Record<string, unknown>; presets: Record<string, unknown>; profiles: Record<string, unknown> } = { version: 1, defaults: {}, presets: {}, profiles: {} };
  if (await fs.pathExists(filePath)) config = YAML.parse(await fs.readFile(filePath, "utf8")) || config;
  config.presets ||= {};
  const safeCtx = toSafeCtx(ctx);
  config.presets[name] = redactSecrets(Object.fromEntries(Object.entries(safeCtx).filter(([key, value]) => SAFE_KEYS.has(key) && key !== "projectName" && value !== undefined)));
  const content = YAML.stringify(config);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, { mode: 0o600 });
  await trustConfig(filePath, content);
  return filePath;
}

async function readHistory(cwd: string): Promise<History> {
  const filePath = getHistoryPath(cwd);
  if (!(await fs.pathExists(filePath))) return { version: VERSION, entries: [] };
  try {
    const value = await fs.readJSON(filePath);
    return value?.version === VERSION && Array.isArray(value.entries) ? value : { version: VERSION, entries: [] };
  } catch { return { version: VERSION, entries: [] }; }
}
