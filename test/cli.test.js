import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const primaryBin = fileURLToPath(new URL("../bin/acli", import.meta.url));
const legacyBin = fileURLToPath(new URL("../bin/create-project", import.meta.url));

function runBin(bin, args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

test("primary executable prints only the package version", () => {
  const result = runBin(primaryBin, ["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "1.0.0\n");
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
  assert.equal(result.stdout, "1.0.0\n");
  assert.match(result.stderr, /deprecated.*acli create/is);
});
