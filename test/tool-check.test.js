import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertToolsAvailable, checkTool, meetsMinimumVersion, TOOL_CATALOG } from "../src/system/toolCheck.ts";

test("docker check verifies Docker Compose v2, not just the docker binary", () => {
  assert.deepEqual(TOOL_CATALOG.docker.args, ["compose", "version"]);
});

test("lando check uses `lando version` and falls back to `--version` for older releases", () => {
  assert.deepEqual(TOOL_CATALOG.lando.args, ["version"]);
  assert.deepEqual(TOOL_CATALOG.lando.fallbackArgs, [["--version"]]);
});

test("checkTool falls back to the next version args when the first ones fail", { skip: process.platform === "win32" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acli-fake-lando-"));
  // Mimics an older Lando: no `version` subcommand, only `--version`.
  fs.writeFileSync(path.join(dir, "lando"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v3.20.0; exit 0; fi\necho "Unknown command"; exit 1\n', { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${originalPath}`;
  try {
    const result = checkTool("lando");
    assert.equal(result.ok, true);
    assert.equal(result.version, "v3.20.0");
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
