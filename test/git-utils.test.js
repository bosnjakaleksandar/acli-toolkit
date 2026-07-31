import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { getGitignore, mergeGitignoreContents, mergeGitignoreForImport, scaffoldGitignore } from "../src/system/gitignore.ts";

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

test("import replaces the one-line .acli placeholder with the complete WordPress template", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-git-utils-import-"));
  await fs.writeFile(path.join(directory, ".gitignore"), ".acli/\n");
  await mergeGitignoreForImport(directory, "wordpress");
  const written = await fs.readFile(path.join(directory, ".gitignore"), "utf8");
  assert.equal(written, await getGitignore("wordpress"));
  assert.match(written, /^\/wp-config\.php$/m);
  assert.match(written, /^\/wp-content\/uploads\/$/m);
  await fs.remove(directory);
});

test("import preserves a remote project .gitignore and appends only missing A-CLI template rules", async () => {
  const remote = "# Project-specific rules\n/custom-cache/\n/wp-admin/\n";
  const current = ".acli/\n";
  const template = await getGitignore("wordpress");
  const merged = mergeGitignoreContents(current, template, remote);

  assert.ok(merged.startsWith(remote.trimEnd()), "the tracked remote file must remain the authoritative base");
  assert.match(merged, /^\/custom-cache\/$/m);
  assert.match(merged, /^\.acli\/$/m);
  assert.match(merged, /^\/wp-config\.php$/m);
  assert.equal(merged.match(/^\/wp-admin\/$/gm)?.length, 1, "an existing remote rule must not be duplicated");
});
