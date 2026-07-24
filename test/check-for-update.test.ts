import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { checkForUpdate, markUpdateNotified } from "../src/update/checkForUpdate.ts";

async function tempCachePath() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-update-check-"));
  return path.join(directory, "update.json");
}

test("does not re-interrupt with a prompt once the same version has already been notified this window", async () => {
  const cachePath = await tempCachePath();
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeJSON(cachePath, { lastChecked: Date.now(), latestVersion: "9.9.9" });

  const first = await checkForUpdate({ packageName: "a-cli", currentVersion: "1.0.0", cachePath });
  assert.equal(first.latestVersion, "9.9.9");
  assert.equal(first.alreadyNotified, false, "not yet notified about this version");

  await markUpdateNotified("9.9.9", Date.now(), cachePath);

  const second = await checkForUpdate({ packageName: "a-cli", currentVersion: "1.0.0", cachePath });
  assert.equal(second.latestVersion, "9.9.9");
  assert.equal(second.alreadyNotified, true, "already notified about 9.9.9 within this cache window — should not prompt again");

  await fs.remove(path.dirname(cachePath));
});

test("a newer pending version than the one already notified is still flagged as not-yet-notified", async () => {
  const cachePath = await tempCachePath();
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeJSON(cachePath, { lastChecked: Date.now(), latestVersion: "9.9.9", notifiedVersion: "9.9.8" });

  const result = await checkForUpdate({ packageName: "a-cli", currentVersion: "1.0.0", cachePath });
  assert.equal(result.latestVersion, "9.9.9");
  assert.equal(result.alreadyNotified, false, "9.9.9 has not been notified yet, even though a stale 9.9.8 notification exists");

  await fs.remove(path.dirname(cachePath));
});

test("returns no pending update when the cached version is not newer than the current one", async () => {
  const cachePath = await tempCachePath();
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeJSON(cachePath, { lastChecked: Date.now(), latestVersion: "1.0.0" });

  const result = await checkForUpdate({ packageName: "a-cli", currentVersion: "1.0.0", cachePath });
  assert.equal(result.latestVersion, null);
  assert.equal(result.alreadyNotified, false);

  await fs.remove(path.dirname(cachePath));
});

test("a 404 from the registry (package not published yet) is cached as 'no update' and does not report offline", async () => {
  const cachePath = await tempCachePath();
  const fakeFetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  let offlineCalled = false;

  const result = await checkForUpdate({
    packageName: "a-cli",
    currentVersion: "2.0.0",
    cachePath,
    fetchImplementation: fakeFetch,
    onOffline: () => { offlineCalled = true; },
  });

  assert.equal(result.latestVersion, null);
  assert.equal(offlineCalled, false, "a 404 is a normal result, not an offline/network failure");

  // The negative result must be cached, or every subsequent run would
  // re-issue the same network call and eventually re-check unnecessarily.
  const cached = await fs.readJSON(cachePath);
  assert.equal(cached.latestVersion, "2.0.0");
  assert.ok(cached.lastChecked);

  await fs.remove(path.dirname(cachePath));
});

test("a genuine network failure (not a 404) still reports offline and is not cached", async () => {
  const cachePath = await tempCachePath();
  const fakeFetch = (async () => { throw new Error("network unreachable"); }) as unknown as typeof fetch;
  let offlineError: unknown = null;

  const result = await checkForUpdate({
    packageName: "a-cli",
    currentVersion: "2.0.0",
    cachePath,
    fetchImplementation: fakeFetch,
    onOffline: (error) => { offlineError = error; },
  });

  assert.equal(result.latestVersion, null);
  assert.ok(offlineError instanceof Error);
  assert.equal(await fs.pathExists(cachePath), false, "a genuine failure should not be cached, so the next run retries instead of waiting out the 24h window");
});

test("markUpdateNotified preserves the existing lastChecked timestamp (does not reset the network-fetch throttle)", async () => {
  const cachePath = await tempCachePath();
  const originalLastChecked = Date.now() - 1000;
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeJSON(cachePath, { lastChecked: originalLastChecked, latestVersion: "9.9.9" });

  await markUpdateNotified("9.9.9", Date.now(), cachePath);

  const saved = await fs.readJSON(cachePath);
  assert.equal(saved.lastChecked, originalLastChecked);
  assert.equal(saved.notifiedVersion, "9.9.9");

  await fs.remove(path.dirname(cachePath));
});
