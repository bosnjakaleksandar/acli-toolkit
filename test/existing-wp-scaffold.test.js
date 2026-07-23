import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import ExistingWPStrategy from "../src/strategies/ExistingWPStrategy.js";
import { readLink } from "../src/services/ProjectLinkService.js";

function makeFakeEnvService(calls) {
  return {
    getLocalUrl: () => "http://localhost:8080",
    scaffold: async (targetDir, type, options) => { calls.push({ op: "envScaffold", type, options }); await fs.writeFile(path.join(targetDir, "docker-compose.yaml"), "services: {}"); },
    start: async () => { calls.push({ op: "start" }); },
    importDb: async () => { calls.push({ op: "importDb" }); },
    wp: async (targetDir, args) => { calls.push({ op: "wp", args }); return args.join(" ") === "option get siteurl" ? "https://demo.staging.example.com" : ""; },
    searchReplace: async (targetDir, from, to) => { calls.push({ op: "searchReplace", from, to }); },
  };
}

function makeFakeRemote(calls) {
  return {
    syncFiles: async (targetDir, spinner, options) => { calls.push({ op: "syncFiles", options }); },
    exportDatabase: async (targetDir) => { calls.push({ op: "exportDatabase" }); await fs.writeFile(path.join(targetDir, "staging.sql"), "CREATE TABLE `wp_options` (id INT);"); },
    getRemoteFacts: async () => { calls.push({ op: "getRemoteFacts" }); return { tablePrefix: "wp_", siteUrl: null }; },
    discoverGit: async () => { calls.push({ op: "discoverGit" }); return null; },
  };
}

async function withTempDir(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-scaffold-"));
  try {
    await run(directory);
  } finally {
    await fs.remove(directory);
  }
}

const baseProfile = {
  profileName: "shared-host",
  ssh: { host: "example.com", username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { transport: "rsync" },
  database: { driver: "wp-cli" },
};

test("scaffold runs files, db export+prefix-detection, env scaffold, link, git, and db import in the correct order", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    const ctx = { projectName: "demo", environment: "docker", profile: baseProfile, mysqlVersion: "8.0", wpVersion: "latest" };

    await strategy.scaffold(dir, ctx, null);

    const ops = calls.map((call) => call.op);
    assert.deepEqual(ops, ["syncFiles", "exportDatabase", "getRemoteFacts", "envScaffold", "discoverGit", "start", "importDb", "wp", "searchReplace", "searchReplace"]);
    assert.equal(await fs.pathExists(path.join(dir, ".gitignore")), true);
    assert.equal(await fs.pathExists(path.join(dir, "docker-compose.yaml")), true);
  });
});

test("scaffold writes a project link with the profile name attached", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    const ctx = { projectName: "demo", environment: "docker", profile: baseProfile, mysqlVersion: "8.0", wpVersion: "latest" };

    await strategy.scaffold(dir, ctx, null);

    const link = await readLink(dir);
    assert.deepEqual(link, { name: "demo", type: "wordpress", environment: "docker", profile: "shared-host", linkedAt: link.linkedAt });
  });
});

test("scaffold cleans up staging.sql after a successful import unless keepDump is set", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    await strategy.scaffold(dir, { projectName: "demo", environment: "docker", profile: baseProfile }, null);
    assert.equal(await fs.pathExists(path.join(dir, "staging.sql")), false);
  });

  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    await strategy.scaffold(dir, { projectName: "demo", environment: "docker", profile: baseProfile, keepDump: true }, null);
    assert.equal(await fs.pathExists(path.join(dir, "staging.sql")), true);
  });
});

test("scaffold respects skipFiles/skipDatabase/skipGitLink", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    const ctx = { projectName: "demo", environment: "docker", profile: baseProfile, skipFiles: true, skipDatabase: true, skipGitLink: true };

    await strategy.scaffold(dir, ctx, null);

    const ops = calls.map((call) => call.op);
    assert.deepEqual(ops, ["envScaffold"]);
  });
});

test("a step failure surfaces which phase broke, not just the raw underlying error", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const fakeRemote = makeFakeRemote(calls);
    fakeRemote.exportDatabase = async () => { throw new Error("Command failed: ssh ... wp db export -"); };
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => fakeRemote);
    const ctx = { projectName: "demo", environment: "docker", profile: baseProfile, skipFiles: true, skipGitLink: true };

    await assert.rejects(
      () => strategy.scaffold(dir, ctx, null),
      (error) => {
        assert.match(error.message, /^Step "export database" failed:/);
        assert.match(error.message, /Command failed: ssh/);
        assert.equal(error.step, "export database");
        return true;
      },
    );
  });
});

test("the detected table prefix is templated into the scaffolded environment", async () => {
  await withTempDir(async (dir) => {
    const calls = [];
    const strategy = new ExistingWPStrategy(makeFakeEnvService(calls), () => makeFakeRemote(calls));
    await strategy.scaffold(dir, { projectName: "demo", environment: "docker", profile: baseProfile }, null);

    const envScaffoldCall = calls.find((call) => call.op === "envScaffold");
    assert.equal(envScaffoldCall.options.tablePrefix, "wp_");
  });
});
