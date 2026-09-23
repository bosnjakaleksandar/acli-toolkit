import test from "node:test";
import assert from "node:assert/strict";
import { assertToolsAvailable, checkTool, meetsMinimumVersion, TOOL_CATALOG } from "../src/system/toolCheck.ts";

test("docker check verifies Docker Compose v2, not just the docker binary", () => {
  assert.deepEqual(TOOL_CATALOG.docker.args, ["compose", "version"]);
});

test("checkTool finds a present executable and reports its version", () => {
  const result = checkTool("node");
  assert.equal(result.ok, true);
  assert.match(result.version, /^v?\d+\.\d+\.\d+/);
});

test("checkTool reports a missing executable as not ok", () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const result = checkTool("lando");
    assert.equal(result.ok, false);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("checkTool returns null for an unknown catalog key", () => {
  assert.equal(checkTool("not-a-real-tool"), null);
});

test("assertToolsAvailable passes for installed tools and lists every missing one with its fix", () => {
  assert.doesNotThrow(() => assertToolsAvailable(["node", "git"]));
  assert.throws(() => assertToolsAvailable(["node", "not-a-real-tool", "also-missing"]), (error) => {
    assert.equal(error.code, "PREFLIGHT_FAILED");
    assert.match(error.message, /not-a-real-tool, also-missing/);
    assert.match(error.hint, /not-a-real-tool: Install not-a-real-tool/);
    return true;
  });
});


test("minimum-version checks reject runtimes below the supported floor", () => {
  assert.equal(meetsMinimumVersion("v22.17.9", "22.18.0"), false);
  assert.equal(meetsMinimumVersion("v22.18.0", "22.18.0"), true);
  assert.equal(meetsMinimumVersion("PHP 8.3.6 (cli)", "8.2.0"), true);
  assert.equal(TOOL_CATALOG.node.minimumVersion, "22.18.0");
});

test("scp has no version flag, so it only needs to be startable", () => {
  assert.equal(TOOL_CATALOG.scp.presenceOnly, true);
  assert.equal(checkTool("scp").ok, true);
});
