import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Guards package.json's "files" allowlist: this test fails loudly if the
// published tarball ever starts including something it shouldn't (source
// maps, tests, source, local tooling config) instead of that only being
// caught by a human eyeballing `npm pack --dry-run` output before a release.
test("npm pack only includes the intended files (no source maps, tests, src/, or local tooling config)", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: repoRoot, encoding: "utf8" });
  const [{ files }] = JSON.parse(output);
  const paths = files.map((file) => file.path);

  assert.ok(paths.length > 0, "expected the tarball to contain files");
  for (const filePath of paths) {
    assert.ok(!filePath.endsWith(".map"), `tarball should not include source maps: ${filePath}`);
    assert.ok(!filePath.startsWith("test/"), `tarball should not include tests: ${filePath}`);
    assert.ok(!filePath.startsWith("src/"), `tarball should not include TypeScript source: ${filePath}`);
    assert.ok(!filePath.startsWith(".claude/"), `tarball should not include local tooling config: ${filePath}`);
    assert.ok(!filePath.includes(".DS_Store"), `tarball should not include .DS_Store: ${filePath}`);
  }

  for (const expected of ["package.json", "README.md", "LICENSE", "bin/acli", "dist/cli/run.js"]) {
    assert.ok(paths.includes(expected), `expected the tarball to include ${expected}`);
  }
});
