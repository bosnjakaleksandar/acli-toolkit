import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { shouldCheckForUpdates } from "../src/cli/run.ts";

const primaryBin = fileURLToPath(new URL("../bin/acli", import.meta.url));
const legacyBin = fileURLToPath(new URL("../bin/create-project", import.meta.url));
const packageVersion = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version;

function runBin(bin, args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

test("primary executable prints only the package version", () => {
  const result = runBin(primaryBin, ["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${packageVersion}\n`);
  assert.equal(result.stderr, "");
});

test("root help presents A-CLI as a command platform", () => {
  const result = runBin(primaryBin, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /A-CLI Developer Toolkit/);
  assert.match(result.stdout, /Usage: acli \[options\] \[command\]/);
  assert.match(result.stdout, /create \[options\]/);
  assert.match(result.stdout, /doctor/);
  assert.match(result.stdout, /update/);
});

test("legacy executable warns and preserves root commands", () => {
  const result = runBin(legacyBin, ["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${packageVersion}\n`);
  assert.match(result.stderr, /deprecated.*acli create/is);
});

test("update check is bypassed by non-interactive flags and CI", () => {
  assert.equal(shouldCheckForUpdates(["create", "--yes"], {}), false);
  assert.equal(shouldCheckForUpdates(["create", "--non-interactive"], {}), false);
  assert.equal(shouldCheckForUpdates(["create", "--quiet"], {}), false);
  assert.equal(shouldCheckForUpdates(["create"], { CI: "true" }), false);
});

test("update check is bypassed for doctor — a fast diagnostic command run repeatedly while troubleshooting", () => {
  assert.equal(shouldCheckForUpdates(["doctor"], {}), false);
  assert.equal(shouldCheckForUpdates(["doctor", "--environment", "docker"], {}), false);
});

test("update check still runs for a plain interactive invocation", () => {
  assert.equal(shouldCheckForUpdates(["create"], {}), true);
});
