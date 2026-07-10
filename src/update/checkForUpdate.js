import { readUpdateCache, isCacheFresh, writeUpdateCache } from "./cache.js";
import { fetchLatestVersion } from "./registry.js";
import { isNewerVersion } from "./semver.js";

export async function checkForUpdate({ packageName, currentVersion, now = Date.now(), onOffline }) {
  const cache = await readUpdateCache();
  let latestVersion;
  if (isCacheFresh(cache, now)) {
    latestVersion = cache.latestVersion;
  } else {
    try {
      latestVersion = await fetchLatestVersion(packageName);
      await writeUpdateCache({ lastChecked: now, latestVersion }).catch(() => {});
    } catch (error) {
      await onOffline?.(error);
      return null;
    }
  }
  try {
    return isNewerVersion(latestVersion, currentVersion) ? latestVersion : null;
  } catch {
    return null;
  }
}
