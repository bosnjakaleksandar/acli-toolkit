import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { getGitignore, scaffoldGitignore } from "../src/utils/git.ts";

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "templates", "gitignore");

test("getGitignore returns the real per-type template content", async () => {
  const wordpress = await getGitignore("wordpress");
  assert.match(wordpress, /wp-content/);
  const laravel = await getGitignore("laravel");
  assert.match(laravel, /backend\/vendor/);
});

test("getGitignore resolves aliases through templateMap (wp-existing -> wordpress)", async () => {
  assert.equal(await getGitignore("wp-existing"), await getGitignore("wordpress"));
});

test("getGitignore falls back to a minimal default for a project type with no matching template file", async () => {
  const content = await getGitignore("some-type-with-no-template");
  assert.match(content, /node_modules\//);
  assert.match(content, /Default gitignore/);
});

test("getGitignore falls back to the same default when the template path exists but can't be read as a file (the silent-catch branch)", async () => {
  // getGitignore's `catch` swallows any read error and falls back to the
  // default content — including EISDIR, which is the cheapest way to
  // provoke a read failure deterministically (no permissions/OS quirks).
  const bogusTemplatePath = path.join(templatesDir, "test-catch-branch.gitignore.tpl");
  await fs.ensureDir(bogusTemplatePath); // a directory, not a file, at the path getGitignore expects to read
  try {
    const content = await getGitignore("test-catch-branch");
    assert.match(content, /Default gitignore/);
  } finally {
    await fs.remove(bogusTemplatePath);
  }
});

test("scaffoldGitignore writes the resolved template to <targetDir>/.gitignore", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-git-utils-"));
  await scaffoldGitignore(directory, "wordpress");
  const written = await fs.readFile(path.join(directory, ".gitignore"), "utf8");
  assert.equal(written, await getGitignore("wordpress"));
  await fs.remove(directory);
});
