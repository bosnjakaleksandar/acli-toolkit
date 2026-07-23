import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getLegacyUpdateCachePath, getUpdateCachePath } from "../config/paths.js";

export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export { getUpdateCachePath };

async function readCacheFile(cachePath) {
  const cache = JSON.parse(await readFile(cachePath, "utf8"));
  if (typeof cache.lastChecked !== "number" || typeof cache.latestVersion !== "string") return null;
  return cache;
}

export async function readUpdateCache(cachePath = getUpdateCachePath(), legacyCachePath = getLegacyUpdateCachePath()) {
  try {
    return await readCacheFile(cachePath);
  } catch {
    // One-time fallback to the pre-unification `~/.a-cli/update.json` location
    // so upgrading users don't lose a same-day cache. Writes always go to the
    // unified path; this legacy file is never written to again.
    try {
      return await readCacheFile(legacyCachePath);
    } catch {
      return null;
    }
  }
}

export async function writeUpdateCache(cache, cachePath = getUpdateCachePath()) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function isCacheFresh(cache, now = Date.now()) {
  return Boolean(cache && now - cache.lastChecked < UPDATE_INTERVAL_MS && now >= cache.lastChecked);
}
