import path from "node:path";
import crypto from "node:crypto";
import fs from "fs-extra";
import { getUserConfigDir } from "../config/paths.ts";

type EnvLike = Record<string, string | undefined>;

/**
 * A project-scoped `.acli/config.yaml` is auto-discovered from the current
 * working directory, which may be a repository someone else wrote (cloned,
 * checked out, downloaded). Content-hash trust pinning — the same model
 * direnv uses for `.envrc` — lets A-CLI tell "a config I (or this CLI)
 * already approved" apart from "a config that just appeared in cwd" without
 * asking again on every run, while still re-prompting if the file changes.
 */
export function getTrustStorePath(env: EnvLike = process.env): string {
  return path.join(getUserConfigDir(process.platform, env), "trusted-configs.json");
}

export function hashConfigContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function isConfigTrusted(filePath: string, content: string, env: EnvLike = process.env): Promise<boolean> {
  const store = await readTrustStore(env);
  return store[path.resolve(filePath)] === hashConfigContent(content);
}

/** Records the given file's current content hash as trusted. Called automatically whenever A-CLI itself writes a config file, and available via `acli config trust` for files a user wants to approve manually. */
export async function trustConfig(filePath: string, content: string, env: EnvLike = process.env): Promise<void> {
  const storePath = getTrustStorePath(env);
  const store = await readTrustStore(env);
  store[path.resolve(filePath)] = hashConfigContent(content);
  await fs.ensureDir(path.dirname(storePath));
  const temporary = `${storePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
  await fs.rename(temporary, storePath);
}

async function readTrustStore(env: EnvLike): Promise<Record<string, string>> {
  const storePath = getTrustStorePath(env);
  if (!(await fs.pathExists(storePath))) return {};
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
