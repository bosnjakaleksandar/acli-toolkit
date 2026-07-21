import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { isCacheFresh, readUpdateCache, UPDATE_INTERVAL_MS, writeUpdateCache } from "../src/update/cache.js";

test("considers cache fresh for at most 24 hours", () => {
  const now = 2_000_000_000;
  assert.equal(isCacheFresh({ lastChecked: now - UPDATE_INTERVAL_MS + 1 }, now), true);
  assert.equal(isCacheFresh({ lastChecked: now - UPDATE_INTERVAL_MS }, now), false);
  assert.equal(isCacheFresh({ lastChecked: now + 1 }, now), false);
  assert.equal(isCacheFresh(null, now), false);
});

test("reads and writes the unified cache path directly", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-cache-"));
  const cachePath = path.join(directory, "a-cli", "update.json");
  await writeUpdateCache({ lastChecked: 123, latestVersion: "9.9.9" }, cachePath);
  assert.deepEqual(await readUpdateCache(cachePath), { lastChecked: 123, latestVersion: "9.9.9" });
});

test("falls back to the legacy ~/.a-cli/update.json when the unified path is missing", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-legacy-"));
  const missingUnifiedPath = path.join(directory, "a-cli-config", "update.json");
  const legacyPath = path.join(directory, ".a-cli", "update.json");
  await fs.ensureDir(path.dirname(legacyPath));
  await fs.writeFile(legacyPath, JSON.stringify({ lastChecked: 456, latestVersion: "1.2.3" }));
  const cache = await readUpdateCache(missingUnifiedPath, legacyPath);
  assert.deepEqual(cache, { lastChecked: 456, latestVersion: "1.2.3" });
});

test("returns null when neither the unified nor the legacy cache exists", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-nohome-"));
  const missingUnifiedPath = path.join(directory, "a-cli", "update.json");
  const missingLegacyPath = path.join(directory, ".a-cli", "update.json");
  assert.equal(await readUpdateCache(missingUnifiedPath, missingLegacyPath), null);
});
