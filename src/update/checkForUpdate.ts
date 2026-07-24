import { readUpdateCache, isCacheFresh, writeUpdateCache } from "./cache.ts";
import { fetchLatestVersion, PackageNotFoundError } from "./registry.ts";
import { isNewerVersion } from "./semver.ts";

export interface CheckForUpdateOptions {
  packageName: string;
  currentVersion: string;
  now?: number;
  onOffline?: (error: unknown) => void | Promise<void>;
  cachePath?: string;
  fetchImplementation?: typeof fetch;
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
export async function checkForUpdate({ packageName, currentVersion, now = Date.now(), onOffline, cachePath, fetchImplementation }: CheckForUpdateOptions): Promise<CheckForUpdateResult> {
  const cache = await readUpdateCache(cachePath);
  let latestVersion: string;
  let notifiedVersion = cache?.notifiedVersion ?? null;
  if (isCacheFresh(cache, now)) {
    latestVersion = cache!.latestVersion;
  } else {
    try {
      latestVersion = fetchImplementation ? await fetchLatestVersion(packageName, fetchImplementation) : await fetchLatestVersion(packageName);
      notifiedVersion = null; // a fresh check window is a fresh chance to notify
      await writeUpdateCache({ lastChecked: now, latestVersion, notifiedVersion }, cachePath).catch(() => {});
    } catch (error) {
      // A package that isn't published yet (or was unpublished) isn't
      // "offline" — it's a normal, cacheable "no update available" result.
      // Without this, every single command run would re-attempt the network
      // call and show an "update check unavailable" message, since a 404
      // response is never cached below and gets treated as a fresh failure
      // every time.
      if (error instanceof PackageNotFoundError) {
        await writeUpdateCache({ lastChecked: now, latestVersion: currentVersion, notifiedVersion: null }, cachePath).catch(() => {});
        return { latestVersion: null, alreadyNotified: false };
      }
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
