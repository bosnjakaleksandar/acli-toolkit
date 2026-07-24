import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { execFileSync } from "node:child_process";
import { scaffoldGitignore } from "../src/utils/git.ts";

function isIgnored(root, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

test("the Laravel gitignore's anchored rules actually match paths under backend/, where the Laravel app lives (LaravelStrategy scaffolds it to <targetDir>/backend)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-laravel-gitignore-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  await scaffoldGitignore(root, "laravel");

  const shouldBeIgnored = [
    "backend/vendor/autoload.php",
    "backend/storage/framework/logs/laravel.log",
    "backend/storage/app.key",
    "backend/public/hot",
    ".env",
    "frontend/.env.local",
  ];
  for (const relativePath of shouldBeIgnored) {
    await fs.ensureDir(path.dirname(path.join(root, relativePath)));
    await fs.writeFile(path.join(root, relativePath), "x");
    assert.ok(isIgnored(root, relativePath), `expected ${relativePath} to be ignored`);
  }

  await fs.remove(root);
});

test("the Laravel gitignore does not accidentally ignore backend/.env.example", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-laravel-gitignore-example-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  await scaffoldGitignore(root, "laravel");
  await fs.ensureDir(path.join(root, "backend"));
  await fs.writeFile(path.join(root, "backend", ".env.example"), "x");
  assert.equal(isIgnored(root, "backend/.env.example"), false);
  await fs.remove(root);
});
