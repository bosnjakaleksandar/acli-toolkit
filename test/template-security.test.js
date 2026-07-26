import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import DockerComposeService from "../src/services/DockerComposeService.ts";
import LandoService from "../src/services/LandoService.ts";
import { getGitignore, scaffoldGitignore } from "../src/utils/git.ts";

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("generated docker-compose.yaml never publishes a port without a 127.0.0.1 host binding", async () => {
  const dir = await tempDir("acli-tpl-docker-");
  const service = new DockerComposeService({ runner: async () => "" });
  await service.scaffold(dir, "wordpress", { projectName: "demo", mysqlVersion: "8.0", wpVersion: "latest", tablePrefix: "wp_" });
  const content = await fs.readFile(path.join(dir, "docker-compose.yaml"), "utf8");
  const portLines = content.split("\n").filter((line) => /^\s*-\s*"?\d/.test(line.trim()) && line.includes(":"));
  assert.ok(portLines.length > 0, "expected at least one port mapping in the generated compose file");
  for (const line of portLines) {
    assert.match(line, /127\.0\.0\.1:/, `port mapping is not loopback-bound: ${line.trim()}`);
  }
  await fs.remove(dir);
});

test("generated docker-compose.yaml's phpMyAdmin service does not auto-authenticate (no PMA_USER/PMA_PASSWORD)", async () => {
  const dir = await tempDir("acli-tpl-docker-pma-");
  const service = new DockerComposeService({ runner: async () => "" });
  await service.scaffold(dir, "wordpress", { projectName: "demo", mysqlVersion: "8.0", wpVersion: "latest", tablePrefix: "wp_" });
  const content = await fs.readFile(path.join(dir, "docker-compose.yaml"), "utf8");
  assert.doesNotMatch(content, /PMA_USER/);
  assert.doesNotMatch(content, /PMA_PASSWORD/);
  await fs.remove(dir);
});

// Regression coverage for phase 1b: ImportWorkflow used to scaffold before
// detecting the table prefix, so a non-default prefix never reached the
// generated environment files — both silently defaulted to "wp_" instead.
test("a non-default table prefix reaches the generated docker-compose.yaml, not the wp_ default", async () => {
  const dir = await tempDir("acli-tpl-docker-prefix-");
  const service = new DockerComposeService({ runner: async () => "" });
  await service.scaffold(dir, "wordpress", { projectName: "demo", mysqlVersion: "8.0", wpVersion: "latest", tablePrefix: "xyz_" });
  const content = await fs.readFile(path.join(dir, "docker-compose.yaml"), "utf8");
  assert.match(content, /WORDPRESS_TABLE_PREFIX:\s*xyz_/);
  assert.doesNotMatch(content, /WORDPRESS_TABLE_PREFIX:\s*wp_/);
  await fs.remove(dir);
});

test("a non-default table prefix reaches the generated .lando.yml, not the wp_ default", async () => {
  const dir = await tempDir("acli-tpl-lando-prefix-");
  const service = new LandoService({ runner: async () => "" });
  await service.scaffold(dir, "wordpress", { projectName: "demo", mysqlVersion: "8.0", tablePrefix: "xyz_" });
  const content = await fs.readFile(path.join(dir, ".lando.yml"), "utf8");
  assert.match(content, /TABLE_PREFIX:\s*xyz_/);
  assert.match(content, /--dbprefix="xyz_"/);
  await fs.remove(dir);
});

test("generated .lando.yml never pipes a downloaded script directly into a shell (curl | bash)", async () => {
  const dir = await tempDir("acli-tpl-lando-");
  const service = new LandoService({ runner: async () => "" });
  await service.scaffold(dir, "wordpress", { projectName: "demo", mysqlVersion: "8.0", tablePrefix: "wp_" });
  const content = await fs.readFile(path.join(dir, ".lando.yml"), "utf8");
  assert.doesNotMatch(content, /curl[^\n]*\|\s*bash/);
  assert.doesNotMatch(content, /curl[^\n]*\|\s*sh\b/);
  await fs.remove(dir);
});

test("every generated gitignore excludes .acli/ (project link + history metadata) and .env*", async () => {
  for (const type of ["wordpress", "laravel", "wp-existing"]) {
    const dir = await tempDir(`acli-tpl-gitignore-${type}-`);
    await scaffoldGitignore(dir, type);
    const content = await fs.readFile(path.join(dir, ".gitignore"), "utf8");
    assert.match(content, /(^|\n)\.acli\/(\n|$)/, `${type} gitignore should exclude .acli/`);
    assert.match(content, /(^|\n)\.env(\n|$)/, `${type} gitignore should exclude .env`);
    assert.match(content, /(^|\n)\.env\.\*/, `${type} gitignore should exclude .env.*`);
    await fs.remove(dir);
  }
});
