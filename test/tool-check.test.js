import test from "node:test";
import assert from "node:assert/strict";
import { checkTool, TOOL_CATALOG, toolExists } from "../src/services/ToolCheckService.js";

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

test("toolExists mirrors checkTool().ok and is false for unknown keys", () => {
  assert.equal(toolExists("node"), true);
  assert.equal(toolExists("not-a-real-tool"), false);
});
