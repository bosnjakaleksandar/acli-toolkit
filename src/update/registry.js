const REQUEST_TIMEOUT_MS = 5_000;

export async function fetchLatestVersion(packageName, fetchImplementation = globalThis.fetch) {
  const name = packageName.startsWith("@") ? packageName.replace("/", "%2f") : packageName;
  const response = await fetchImplementation(`https://registry.npmjs.org/${name}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
  const metadata = await response.json();
  if (typeof metadata.version !== "string") throw new Error("npm registry response has no version");
  return metadata.version;
}
