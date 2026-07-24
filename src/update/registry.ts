const REQUEST_TIMEOUT_MS = 5_000;

/**
 * A registry lookup that completed successfully but found no such package —
 * distinct from a network/timeout failure. A package that isn't published
 * yet (or was unpublished) isn't "offline"; checkForUpdate treats the two
 * differently so a not-yet-published tool doesn't nag the user every single
 * run with an "update check unavailable" message.
 */
export class PackageNotFoundError extends Error {
  constructor(packageName: string) {
    super(`Package "${packageName}" was not found on the npm registry.`);
    this.name = "PackageNotFoundError";
  }
}

export async function fetchLatestVersion(packageName: string, fetchImplementation: typeof fetch = globalThis.fetch): Promise<string> {
  const name = packageName.startsWith("@") ? packageName.replace("/", "%2f") : packageName;
  const response = await fetchImplementation(`https://registry.npmjs.org/${name}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) throw new PackageNotFoundError(packageName);
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
  const metadata = (await response.json()) as { version?: unknown };
  if (typeof metadata.version !== "string") throw new Error("npm registry response has no version");
  return metadata.version;
}
