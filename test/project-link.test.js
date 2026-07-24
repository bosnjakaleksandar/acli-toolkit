import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { findProjectRoot, readLink, writeLink } from "../src/services/ProjectLinkService.ts";

test("writeLink then readLink round-trips the project link", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-"));
  await writeLink(root, { name: "client-site", type: "wordpress", environment: "docker", profile: "shared-host" });
  const link = await readLink(root);
  assert.deepEqual(link, { name: "client-site", type: "wordpress", environment: "docker", profile: "shared-host" });
  await fs.remove(root);
});

test("writeLink preserves other config already in the project file (e.g. a saved preset)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-"));
  const YAML = (await import("yaml")).default;
  await fs.ensureDir(path.join(root, ".acli"));
  await fs.writeFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({ version: 1, presets: { recipe: { setupType: "new" } } }));
  await writeLink(root, { name: "client-site", environment: "docker" });
  const raw = YAML.parse(await fs.readFile(path.join(root, ".acli", "config.yaml"), "utf8"));
  assert.deepEqual(raw.presets, { recipe: { setupType: "new" } });
  assert.deepEqual(raw.project, { name: "client-site", environment: "docker" });
  await fs.remove(root);
});

test("writeLink rejects a link missing required fields", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-"));
  await assert.rejects(() => writeLink(root, { name: "client-site" }), /environment is required/);
  await fs.remove(root);
});

test("writeLink rejects a project name with characters unsafe for a filesystem/package name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-"));
  await assert.rejects(() => writeLink(root, { name: "../evil; rm -rf", environment: "docker" }), /Project name can only contain/);
  await fs.remove(root);
});

test("writeLink adds .acli/ to the project's .gitignore when linking into an existing, already-tracked repo", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-gitignore-"));
  await fs.writeFile(path.join(root, ".gitignore"), "node_modules/\n");
  await writeLink(root, { name: "client-site", environment: "docker" });
  const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /(^|\n)\.acli\/(\n|$)/);
  await fs.remove(root);
});

test("writeLink creates a .gitignore excluding .acli/ when none exists yet", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-no-gitignore-"));
  await writeLink(root, { name: "client-site", environment: "docker" });
  const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /(^|\n)\.acli\/(\n|$)/);
  await fs.remove(root);
});

test("writeLink does not duplicate the .acli/ entry if the .gitignore already excludes it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-dup-gitignore-"));
  await fs.writeFile(path.join(root, ".gitignore"), ".acli/\nnode_modules/\n");
  await writeLink(root, { name: "client-site", environment: "docker" });
  const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
  assert.equal(gitignore.match(/\.acli\//g).length, 1);
  await fs.remove(root);
});

test("findProjectRoot finds the linked project from a nested subdirectory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-link-"));
  await writeLink(root, { name: "client-site", environment: "docker" });
  const nested = path.join(root, "wp-content", "themes", "client-site");
  await fs.ensureDir(nested);
  assert.equal(await findProjectRoot(nested), root);
});

test("findProjectRoot returns null when no linked project exists above cwd", async () => {
  const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), "acli-unlinked-"));
  assert.equal(await findProjectRoot(unrelated), null);
  await fs.remove(unrelated);
});

test("findProjectRoot ignores a .acli/config.yaml that has no project link (e.g. just a saved preset)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-noproject-"));
  const YAML = (await import("yaml")).default;
  await fs.ensureDir(path.join(root, ".acli"));
  await fs.writeFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({ version: 1, presets: { recipe: { setupType: "new" } } }));
  assert.equal(await findProjectRoot(root), null);
  await fs.remove(root);
});
