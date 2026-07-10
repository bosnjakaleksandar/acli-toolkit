import test from "node:test";
import assert from "node:assert/strict";
import { isCacheFresh, UPDATE_INTERVAL_MS } from "../src/update/cache.js";

test("considers cache fresh for at most 24 hours", () => {
  const now = 2_000_000_000;
  assert.equal(isCacheFresh({ lastChecked: now - UPDATE_INTERVAL_MS + 1 }, now), true);
  assert.equal(isCacheFresh({ lastChecked: now - UPDATE_INTERVAL_MS }, now), false);
  assert.equal(isCacheFresh({ lastChecked: now + 1 }, now), false);
  assert.equal(isCacheFresh(null, now), false);
});
