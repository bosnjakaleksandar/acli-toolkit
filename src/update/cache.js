import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BRANDING } from "../config/branding.js";

export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getUpdateCachePath() {
  return path.join(os.homedir(), BRANDING.cacheDirectory, "update.json");
}

export async function readUpdateCache(cachePath = getUpdateCachePath()) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    if (typeof cache.lastChecked !== "number" || typeof cache.latestVersion !== "string") return null;
    return cache;
  } catch {
    return null;
  }
}

export async function writeUpdateCache(cache, cachePath = getUpdateCachePath()) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function isCacheFresh(cache, now = Date.now()) {
  return Boolean(cache && now - cache.lastChecked < UPDATE_INTERVAL_MS && now >= cache.lastChecked);
}
