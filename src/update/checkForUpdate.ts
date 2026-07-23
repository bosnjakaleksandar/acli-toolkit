import { readUpdateCache, isCacheFresh, writeUpdateCache } from "./cache.ts";
import { fetchLatestVersion } from "./registry.ts";
import { isNewerVersion } from "./semver.ts";

export interface CheckForUpdateOptions {
  packageName: string;
  currentVersion: string;
  now?: number;
  onOffline?: (error: unknown) => void | Promise<void>;
  cachePath?: string;
}

export interface CheckForUpdateResult {
  latestVersion: string | null;
  alreadyNotified: boolean;
}

/**
 * Checks for a newer published version. The network fetch itself is
 * throttled to once per 24h via the cache (unchanged). Separately, this
 * also tracks whether the *user* has already been notified about the
 * specific pending version, via `cache.notifiedVersion` — so a command run
 * five times in a row doesn't interactively prompt about the same known
 * update five times. `alreadyNotified` lets the caller downgrade to a quiet
 * one-line reminder instead of a blocking confirm prompt.
 */
export async function checkForUpdate({ packageName, currentVersion, now = Date.now(), onOffline, cachePath }: CheckForUpdateOptions): Promise<CheckForUpdateResult> {
  const cache = await readUpdateCache(cachePath);
  let latestVersion: string;
  let notifiedVersion = cache?.notifiedVersion ?? null;
  if (isCacheFresh(cache, now)) {
    latestVersion = cache!.latestVersion;
  } else {
    try {
      latestVersion = await fetchLatestVersion(packageName);
      notifiedVersion = null; // a fresh check window is a fresh chance to notify
      await writeUpdateCache({ lastChecked: now, latestVersion, notifiedVersion }, cachePath).catch(() => {});
    } catch (error) {
      await onOffline?.(error);
      return { latestVersion: null, alreadyNotified: false };
    }
  }
  let isNewer = false;
  try {
    isNewer = isNewerVersion(latestVersion, currentVersion);
  } catch {
    return { latestVersion: null, alreadyNotified: false };
  }
  if (!isNewer) return { latestVersion: null, alreadyNotified: false };
  return { latestVersion, alreadyNotified: notifiedVersion === latestVersion };
}

/** Records that the user has now been told about this pending version, so the next check this window can skip straight to a quiet reminder. */
export async function markUpdateNotified(latestVersion: string, now: number = Date.now(), cachePath?: string): Promise<void> {
  const cache = await readUpdateCache(cachePath);
  await writeUpdateCache({ lastChecked: cache?.lastChecked ?? now, latestVersion, notifiedVersion: latestVersion }, cachePath).catch(() => {});
}
