import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isNewerVersion } from "../src/update/semver.ts";

test("compares numeric semantic version components", () => {
  assert.equal(compareVersions("1.9.0", "1.10.0"), -1);
  assert.equal(compareVersions("1.10.1", "1.9.9"), 1);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("handles prerelease precedence and build metadata", () => {
  assert.equal(isNewerVersion("1.0.0", "1.0.0-rc.1"), true);
  assert.equal(compareVersions("1.0.0-beta.11", "1.0.0-beta.2"), 1);
  assert.equal(compareVersions("1.0.0+build.2", "1.0.0+build.1"), 0);
});

test("rejects invalid versions", () => {
  assert.throws(() => compareVersions("1.2", "1.2.0"), /Invalid semantic version/);
});
