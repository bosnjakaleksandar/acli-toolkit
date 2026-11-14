import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { dbMismatchWarning, dbSpecFromServerVersion, localDbSpecFromEnvironmentFile, phpSpecFromVersion, serverVersionFromDumpHeader, wordpressImageTag } from "../src/environments/versions.ts";
import { resolveRuntimeVersions } from "../src/wordpress/import/stagingVersions.ts";
import { runImportWorkflow } from "../src/wordpress/import/ImportWorkflow.ts";
import DockerComposeService from "../src/environments/DockerEnvironment.ts";
import LandoService from "../src/environments/LandoEnvironment.ts";
import { fakeRemote, importCtx } from "./helpers/importFakes.ts";
import type EnvironmentService from "../src/environments/EnvironmentService.ts";

const tempDir = (prefix: string) => fs.mkdtemp(path.join(os.tmpdir(), prefix));

test("database server versions map onto the matching local image", () => {
  assert.equal(dbSpecFromServerVersion("10.11.6-MariaDB-0+deb12u1"), "mariadb:10.11");
  assert.equal(dbSpecFromServerVersion("5.5.5-10.6.12-MariaDB"), "mariadb:10.6");
  assert.equal(dbSpecFromServerVersion("11.4.2-MariaDB-ubu2404"), "mariadb:11.4");
  assert.equal(dbSpecFromServerVersion("8.0.36-0ubuntu0.22.04.1"), "8.0");
  assert.equal(dbSpecFromServerVersion("5.7.44-log"), "5.7");
  assert.equal(dbSpecFromServerVersion(""), null);
  assert.equal(dbSpecFromServerVersion("garbage"), null);
});

test("PHP versions reduce to major.minor and reject anything else", () => {
  assert.equal(phpSpecFromVersion("8.1.27"), "8.1");
  assert.equal(phpSpecFromVersion("8.2.12-1+ubuntu22.04.1+deb.sury.org+1"), "8.2");
  assert.equal(phpSpecFromVersion("7.4"), "7.4");
  assert.equal(phpSpecFromVersion("https://example.com"), null);
});

test("the dump header names the server it was taken from", () => {
  assert.equal(serverVersionFromDumpHeader("-- MySQL dump 10.13  Distrib 8.0.36\n--\n-- Host: localhost    Database: wp\n-- Server version\t8.0.36-0ubuntu0.22.04.1\n"), "8.0.36-0ubuntu0.22.04.1");
  assert.equal(serverVersionFromDumpHeader("-- MariaDB dump 10.19\n-- Server version\t10.11.6-MariaDB-0+deb12u1\n"), "10.11.6-MariaDB-0+deb12u1");
  assert.equal(serverVersionFromDumpHeader("CREATE TABLE x (id INT);"), null);
});

test("the wordpress image tag pins PHP only when it is known", () => {
  assert.equal(wordpressImageTag("6.5.3", "8.1"), "6.5.3-php8.1-apache");
  assert.equal(wordpressImageTag("latest", "8.2"), "php8.2-apache");
  assert.equal(wordpressImageTag("6.5.3", null), "6.5.3");
});

test("versions: an explicit flag wins over staging, staging over defaults, and defaults are warned about", () => {
  const facts = { tablePrefix: null, siteUrl: null, phpVersion: "7.4.33", dbVersion: "10.6.12-MariaDB", wpVersion: "6.4.3" };
  const fromStaging = resolveRuntimeVersions({ facts });
  assert.deepEqual([fromStaging.phpVersion, fromStaging.mysqlVersion, fromStaging.wpVersion], ["7.4", "mariadb:10.6", "6.4.3"]);
  assert.deepEqual(fromStaging.warnings, []);

  const flagged = resolveRuntimeVersions({ facts, requested: { phpVersion: "8.1", mysqlVersion: "8.0" } });
  assert.equal(flagged.phpVersion, "8.1");
  assert.equal(flagged.mysqlVersion, "8.0");
  assert.equal(flagged.sources.wpVersion, "staging");

  const nothing = resolveRuntimeVersions({ fallbacks: { wpVersion: "6.8" } });
  assert.deepEqual([nothing.phpVersion, nothing.mysqlVersion, nothing.wpVersion], ["8.3", "8.0", "6.8"]);
  assert.equal(nothing.warnings.length, 3);
  assert.match(nothing.warnings.join("\n"), /--php/);
});

test("versions: without wp-cli access (Coolify) the database comes from the dump header", () => {
  const resolved = resolveRuntimeVersions({ facts: { tablePrefix: null, siteUrl: null }, dumpServerVersion: "10.11.6-MariaDB-0+deb12u1" });
  assert.equal(resolved.mysqlVersion, "mariadb:10.11");
  assert.equal(resolved.sources.mysqlVersion, "staging");
  assert.equal(resolved.sources.phpVersion, "default");
});

test("templates: PHP and database follow the given versions instead of being hardcoded", async () => {
  const dir = await tempDir("acli-versions-templates-");
  const options = { projectName: "demo", mysqlVersion: "mariadb:10.6", phpVersion: "7.4", wpVersion: "6.4.3", tablePrefix: "wp_" };
  await new DockerComposeService({ runner: async () => "" }).scaffold(dir, "wordpress", options);
  await new LandoService({ runner: async () => "" }).scaffold(dir, "wordpress", options);
  const docker = YAML.parse(await fs.readFile(path.join(dir, "docker-compose.yaml"), "utf8"));
  const lando = YAML.parse(await fs.readFile(path.join(dir, ".lando.yml"), "utf8"));
  assert.equal(docker.services.wordpress.image, "wordpress:6.4.3-php7.4-apache");
  assert.equal(docker.services.db.image, "mariadb:10.6");
  assert.equal(lando.config.php, "7.4");
  assert.equal(lando.config.database, "mariadb:10.6");

  for (const type of ["laravel"]) {
    await new DockerComposeService({ runner: async () => "" }).scaffold(dir, type, { projectName: "demo", phpVersion: "8.1" });
    await new LandoService({ runner: async () => "" }).scaffold(dir, type, { projectName: "demo", phpVersion: "8.1" });
    assert.match(await fs.readFile(path.join(dir, "docker-compose.yaml"), "utf8"), /FROM php:8\.1-cli/);
    assert.equal(YAML.parse(await fs.readFile(path.join(dir, ".lando.yml"), "utf8")).config.php, "8.1");
  }
  await fs.remove(dir);
});

test("templates: no placeholder is left behind when no versions are given", async () => {
  const dir = await tempDir("acli-versions-defaults-");
  for (const Service of [DockerComposeService, LandoService]) {
    for (const type of ["wordpress", "laravel"]) {
      await new Service({ runner: async () => "" }).scaffold(dir, type, { projectName: "demo" });
      const file = Service === DockerComposeService ? "docker-compose.yaml" : ".lando.yml";
      const content = await fs.readFile(path.join(dir, file), "utf8");
      assert.doesNotMatch(content, /\{\{[A-Z_]+\}\}/, `${file} (${type}) must not keep placeholders`);
    }
  }
  const lando = YAML.parse(await fs.readFile(path.join(dir, ".lando.yml"), "utf8"));
  assert.equal(lando.config.php, "8.3", "new projects keep the previous default PHP");
  await fs.remove(dir);
});

test("import scaffolds the environment with the staging server's versions", async () => {
  const targetDir = await tempDir("acli-import-versions-");
  let scaffolded: any = null;
  const envService = {
    scaffold: async (_dir: string, _type: string, options: any) => { scaffolded = { ...options }; },
    start: async () => {},
    importDb: async () => {},
    getLocalUrl: () => "http://localhost:8080",
    wp: async () => "http://localhost:8080",
    searchReplace: async () => {},
  } as unknown as EnvironmentService;
  const remote = fakeRemote({
    dump: "-- Server version\t10.11.6-MariaDB\nCREATE TABLE `wp_options` (id INT);\nCREATE TABLE `wp_posts` (id INT);\nCREATE TABLE `wp_users` (id INT);\n",
    overrides: { async getRemoteFacts() { return { tablePrefix: null, siteUrl: null, phpVersion: "8.1.27", dbVersion: null, wpVersion: "6.5.3" }; } },
  });
  const ctx = importCtx(targetDir, { skipGitLink: true });
  delete ctx.mysqlVersion;
  delete ctx.wpVersion;

  await runImportWorkflow({ remote, ctx, targetDir, envService, resume: false });

  assert.equal(scaffolded.phpVersion, "8.1");
  assert.equal(scaffolded.mysqlVersion, "mariadb:10.11", "the dump header fills in what wp-cli didn't report");
  assert.equal(scaffolded.wpVersion, "6.5.3");
  assert.match(ctx.runtimeSummary!, /PHP 8\.1 · DB mariadb:10\.11 · WordPress 6\.5\.3/);
  await fs.remove(targetDir);
});

test("pull warns when the local database differs from the staging dump's server", () => {
  const compose = "services:\n  db:\n    image: mysql:8.0\n";
  const local = localDbSpecFromEnvironmentFile("docker", compose, YAML.parse);
  assert.equal(local, "mysql:8.0");
  assert.match(dbMismatchWarning(local, "10.11.6-MariaDB", "docker-compose.yaml")!, /mariadb 10\.11.*mariadb:10\.11/);
  assert.equal(dbMismatchWarning("mysql:8.0", "8.0.36", "docker-compose.yaml"), null);
  assert.equal(localDbSpecFromEnvironmentFile("lando", "config:\n  database: mariadb:10.6\n", YAML.parse), "mariadb:10.6");
});
