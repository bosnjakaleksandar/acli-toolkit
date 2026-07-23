import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { ALL_TARGETS, PullService, resolvePullTargets } from "../src/services/PullService.ts";
import { RemoteProfileService, resolveRemoteProfile } from "../src/services/RemoteProfileService.ts";
import { CliError } from "../src/core/errors.ts";

test("resolvePullTargets defaults to every target when nothing is requested", () => {
  assert.deepEqual(resolvePullTargets([]), ALL_TARGETS);
  assert.deepEqual(resolvePullTargets(undefined), ALL_TARGETS);
});

test('resolvePullTargets treats "full" as every target', () => {
  assert.deepEqual(resolvePullTargets(["full"]), ALL_TARGETS);
  assert.deepEqual(resolvePullTargets(["db", "full"]), ALL_TARGETS);
});

test("resolvePullTargets keeps only the requested targets, deduplicated, in canonical order", () => {
  assert.deepEqual(resolvePullTargets(["uploads", "db", "uploads"]), ["db", "uploads"]);
  assert.deepEqual(resolvePullTargets(["themes"]), ["themes"]);
});

test("resolvePullTargets rejects unknown targets", () => {
  assert.throws(
    () => resolvePullTargets(["db", "bogus"]),
    (error) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "INVALID_PULL_TARGET");
      assert.match(error.message, /bogus/);
      return true;
    },
  );
});

function makeFakeRemote() {
  const calls = [];
  return {
    calls,
    syncFiles: async (targetDir, spinner, options) => { calls.push({ op: "syncFiles", options }); },
    exportDatabase: async (targetDir) => { calls.push({ op: "exportDatabase" }); await fs.writeFile(path.join(targetDir, "staging.sql"), "CREATE TABLE `wp_options` (id INT);"); },
  };
}

function makeFakeEnvService() {
  return {
    getLocalUrl: () => "http://localhost:8080",
    start: async () => {},
    importDb: async () => {},
    wp: async (targetDir, args) => (args.join(" ") === "option get siteurl" ? "https://demo.staging.example.com" : ""),
    searchReplace: async () => {},
  };
}

async function withTempDir(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pull-"));
  try {
    await run(directory);
  } finally {
    await fs.remove(directory);
  }
}

const baseProfile = { ssh: { host: "example.com", username: "deploy" }, remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" }, files: { transport: "rsync" }, database: { driver: "wp-cli" } };

test("pull with file targets only syncs those directories and never touches the database", async () => {
  await withTempDir(async (dir) => {
    const fakeRemote = makeFakeRemote();
    const service = new PullService(makeFakeEnvService(), () => fakeRemote);
    await service.pull(dir, { projectName: "demo", profile: baseProfile }, ["uploads", "themes"], {}, null);

    assert.deepEqual(fakeRemote.calls, [{ op: "syncFiles", options: { directories: ["uploads", "themes"] } }]);
  });
});

test("pull with db target exports, imports, and removes the dump by default", async () => {
  await withTempDir(async (dir) => {
    const fakeRemote = makeFakeRemote();
    const service = new PullService(makeFakeEnvService(), () => fakeRemote);
    await service.pull(dir, { projectName: "demo", profile: baseProfile }, ["db"], {}, null);

    assert.deepEqual(fakeRemote.calls, [{ op: "exportDatabase" }]);
    assert.equal(await fs.pathExists(path.join(dir, "staging.sql")), false);
  });
});

test("pull with db target keeps the dump when keepDump is set", async () => {
  await withTempDir(async (dir) => {
    const fakeRemote = makeFakeRemote();
    const service = new PullService(makeFakeEnvService(), () => fakeRemote);
    await service.pull(dir, { projectName: "demo", profile: baseProfile }, ["db"], { keepDump: true }, null);

    assert.equal(await fs.pathExists(path.join(dir, "staging.sql")), true);
  });
});

test("a full pull syncs files and the database together", async () => {
  await withTempDir(async (dir) => {
    const fakeRemote = makeFakeRemote();
    const service = new PullService(makeFakeEnvService(), () => fakeRemote);
    await service.pull(dir, { projectName: "demo", profile: baseProfile }, resolvePullTargets([]), {}, null);

    assert.equal(fakeRemote.calls.some((call) => call.op === "syncFiles"), true);
    assert.equal(fakeRemote.calls.some((call) => call.op === "exportDatabase"), true);
  });
});

test("regression: PullService must not re-resolve an already-resolved profile (resolveRemoteProfile is not idempotent)", async () => {
  // resolveRemoteProfile joins remote.wordpressRoot onto projectRoot to
  // produce an absolute path. Calling it a second time on that already-joined
  // path would incorrectly join projectRoot onto it again. PullService takes
  // ctx.profile as pre-resolved and must pass it straight through to
  // RemoteProfileService without resolving it again.
  await withTempDir(async (dir) => {
    const rawProfile = { ssh: { host: "example.com", username: "deploy" }, remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" }, files: { transport: "rsync" }, database: { driver: "wp-cli" } };
    const resolvedProfile = resolveRemoteProfile(rawProfile, { projectName: "demo" });
    assert.equal(resolvedProfile.remote.wordpressRoot, "/srv/demo/wordpress");

    const sshCalls = [];
    const runner = async (command, args) => { sshCalls.push(args.at(-1)); return Buffer.alloc(200, 1); };
    const service = new PullService(makeFakeEnvService(), (profile) => new RemoteProfileService(profile, runner));
    await service.exportDatabase(dir, resolvedProfile, null);

    assert.ok(sshCalls[0].includes("cd '/srv/demo/wordpress'"), `expected single-resolved path, got: ${sshCalls[0]}`);
    assert.ok(!sshCalls[0].includes("/srv/demo/srv/demo"), "wordpressRoot must not be double-joined");
  });
});
