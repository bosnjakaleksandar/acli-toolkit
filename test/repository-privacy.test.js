import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const privateExamples = [
  ["fir", "ma"].join(""),
  ["ku", "ca"].join(""),
  ["pop", "art"].join(""),
  ["claim", "supplement"].join("-"),
  ["blondn", "brown"].join(""),
  ["nis", "ths"].join("-"),
];

test("tracked code and documentation contain only neutral example identifiers", () => {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "buffer" });
  assert.equal(result.status, 0, result.stderr.toString("utf8"));

  const files = result.stdout.toString("utf8").split("\0").filter(Boolean);
  const violations = [];

  for (const file of files) {
    const content = readFileSync(file);
    if (content.includes(0)) continue;

    const normalized = content.toString("utf8").toLowerCase();
    for (const privateExample of privateExamples) {
      const token = new RegExp(`(^|[^a-z0-9])${privateExample}($|[^a-z0-9])`);
      if (token.test(normalized)) violations.push(`${file}: ${privateExample}`);
    }
  }

  assert.deepEqual(violations, []);
});
