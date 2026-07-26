import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { createProfileImportSource } from "../src/features/import/sources/ProfileSource.ts";
import { RemoteProfileService, resolveRemoteProfile } from "../src/services/RemoteProfileService.ts";
import { runImportWorkflow } from "../src/features/import/ImportWorkflow.ts";
import { readLink } from "../src/services/ProjectLinkService.ts";
import { runCommand } from "../src/utils/commandRunner.ts";
import type { Profile } from "../src/core/model/ResolvedProfile.ts";

/**
 * Coverage for phase 4: `--source profile` and `--source ssh` now share one
 * ImportSource implementation (ProfileSource.ts) running through the same
 * ImportWorkflow/StepRunner every other source uses, instead of delegating
 * to a second, separate `create --existing` pipeline. This proves that
 * shared implementation reproduces what ExistingWPStrategy used to do
 * directly: file sync, database export, remote-authoritative prefix
 * detection, project-link writing, and safe/unsafe git-origin linking.
 */

const rawProfile: Profile = {
  type: "wordpress",
  ssh: { host: "demo.example.com", username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { transport: "rsync", targets: { uploads: { path: "wp-content/uploads" } } },
  database: { driver: "wp-cli" },
  urls: { staging: "https://demo.staging.example.com" },
};

function resolvedProfile(overrides: Partial<Profile> = {}) {
  return resolveRemoteProfile({ ...rawProfile, ...overrides }, { projectName: "demo" });
}

async function tempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

// exportDatabase rejects a dump under 100 bytes as "empty or invalid" — pad
// a minimal-but-realistic dump comfortably past that floor.
const FAKE_DUMP_SQL = "-- fake dump for tests, padded well past the 100-byte minimum size floor\nCREATE TABLE `wp_options` (id INT);\n";

// preflight() checks real tool binaries via toolExists() rather than the
// injected `runner` — real on ubuntu-latest (docker preinstalled) but not on
// macos-latest CI runners (no docker CLI at all). The two end-to-end tests
// below only care that runImportWorkflow's orchestration is correct, not
// that this host actually has docker, so they use this subclass to make
// preflight's tool check a no-op while still exercising the real ssh probe
// (via the already-mocked `runner`).
class NoToolCheckRemoteProfileService extends RemoteProfileService {
  requiredTools(): string[] {
    return [];
  }
}

test("fetchFiles delegates to RemoteProfileService.syncFiles and is skipped when skipFiles is set", async () => {
  const calls: string[] = [];
  const runner = async (command: string, args: string[] = []) => { calls.push(command); return ""; };
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new RemoteProfileService(profile, runner));
  const targetDir = await tempDir("acli-profile-source-files-");

  await source.fetchFiles({ targetDir, profile: resolvedProfile(), skipFiles: true } as any);
  assert.equal(calls.length, 0, "skipFiles must prevent any sync call");

  await source.fetchFiles({ targetDir, profile: resolvedProfile(), skipFiles: false } as any);
  assert.ok(calls.includes("rsync"), "fetchFiles must sync via rsync when not skipped");

  await fs.remove(targetDir);
});

test("fetchDatabase delegates to RemoteProfileService.exportDatabase, writing staging.sql", async () => {
  const runner = async () => Buffer.alloc(200, 1);
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new RemoteProfileService(profile, runner));
  const targetDir = await tempDir("acli-profile-source-db-");

  const result = await source.fetchDatabase({ targetDir, profile: resolvedProfile() } as any);
  assert.equal(result.hasDump, true);
  assert.ok(await fs.pathExists(path.join(targetDir, "staging.sql")));

  await fs.remove(targetDir);
});

test("getRemoteFacts delegates to RemoteProfileService.getRemoteFacts (wp-cli driver)", async () => {
  const runner = async (_command: string, args: string[] = []) => {
    const remoteCommand = args.at(-1) as string;
    if (remoteCommand.includes("table_prefix")) return "wp_demo_";
    if (remoteCommand.includes("siteurl")) return "https://demo.staging.example.com";
    return "";
  };
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new RemoteProfileService(profile, runner));
  const facts = await source.getRemoteFacts!({ targetDir: "/tmp/unused", profile: resolvedProfile() } as any);
  assert.deepEqual(facts, { tablePrefix: "wp_demo_", siteUrl: "https://demo.staging.example.com" });
});

test("linkProfile writes the .acli project link and returns the profile name", async () => {
  const source = createProfileImportSource("profile", "Staging profile");
  const targetDir = await tempDir("acli-profile-source-link-");
  await fs.ensureDir(targetDir);

  const profile = resolveRemoteProfile({ ...rawProfile, profileName: "demo" }, { projectName: "demo" });
  const linkedName = await source.linkProfile!(targetDir, { targetDir, profile, projectName: "demo", environment: "docker" } as any);

  assert.equal(linkedName, "demo");
  const link = await readLink(targetDir);
  assert.equal(link?.name, "demo");
  assert.equal(link?.profile, "demo");
  assert.equal(link?.environment, "docker");

  await fs.remove(targetDir);
});

test("linkGit links a safe remote git origin and sets skipGitInit so the caller's own git-init step doesn't also run", async () => {
  // discoverGit() goes through the injected RemoteProfileService runner
  // (simulating the remote `git config --get remote.origin.url`), but the
  // actual `git init`/`git remote add` this triggers run against the real
  // local git binary on targetDir (same as ExistingWPStrategy's #linkGit
  // always did) — verify via that real repo state, not the fake ssh runner.
  const runner = async (command: string) => (command === "ssh" ? "https://github.com/example/repo.git" : "");
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new RemoteProfileService(profile, runner));
  const targetDir = await tempDir("acli-profile-source-git-");

  const ctx: any = { targetDir, profile: resolvedProfile() };
  await source.linkGit!(targetDir, ctx, null);

  assert.equal(ctx.skipGitInit, true);
  assert.ok(await fs.pathExists(path.join(targetDir, ".git")), "git init must have run against targetDir");
  const remoteUrl = (await runCommand("git", ["remote", "get-url", "origin"], { cwd: targetDir })) as string;
  assert.equal(remoteUrl.trim(), "https://github.com/example/repo.git");

  await fs.remove(targetDir);
});

test("linkGit refuses a credential-bearing remote git origin URL and never runs git remote add with it", async () => {
  const calls: string[][] = [];
  const runner = async (command: string, args: string[] = []) => {
    calls.push([command, ...args]);
    if (command === "ssh") return "https://x-access-token:ghp_SECRET@github.com/example/repo.git";
    return "";
  };
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new RemoteProfileService(profile, runner));
  const targetDir = await tempDir("acli-profile-source-git-unsafe-");

  const ctx: any = { targetDir, profile: resolvedProfile() };
  const spinnerCalls: string[] = [];
  await source.linkGit!(targetDir, ctx, { message: (text: string) => spinnerCalls.push(text) });

  assert.equal(ctx.skipGitInit, undefined, "must not mark git as linked when the origin URL was rejected");
  assert.ok(!calls.some((call) => call[0] === "git" && call[1] === "remote"), "git remote add must never run with an unsafe URL");
  assert.ok(spinnerCalls.some((msg) => msg.includes("unsafe") && !msg.includes("ghp_SECRET")), "the skip message must not reproduce the credential");

  await fs.remove(targetDir);
});

test("buildPlan reproduces the same shape ExistingWPStrategy.buildPlan used to produce", async () => {
  const source = createProfileImportSource("profile", "Staging profile");
  const profile = resolveRemoteProfile({ ...rawProfile, profileName: "demo" }, { projectName: "demo" });
  const plan = source.buildPlan!({ targetDir: "/tmp/unused", profile, projectName: "demo", environment: "docker" } as any) as Record<string, unknown>;

  assert.equal(plan.profile, "demo");
  assert.equal(plan.remoteHost, "demo.example.com");
  assert.equal(plan.remoteWordPressRoot, "/srv/demo/wordpress");
  assert.equal(plan.databaseDriver, "wp-cli");
  assert.equal(plan.fileTransfer, "rsync");
  assert.equal(plan.gitLink, true);
  assert.deepEqual(plan.requiredTools, ["ssh", "docker", "rsync"]);
});

test("end-to-end via runImportWorkflow: preflight, prefix detection (remote-authoritative), scaffold, link-profile, link-git, and import all run for the profile source", async () => {
  const targetDir = await tempDir("acli-profile-source-e2e-");
  const calls: string[] = [];
  const runner = async (command: string, args: string[] = []) => {
    const joined = args.join(" ");
    if (command === "ssh" && joined.includes("test -d")) { calls.push("preflight-probe"); return ""; }
    if (command === "rsync") { calls.push("sync-files"); return ""; }
    if (command === "ssh" && joined.includes("wp db export")) { calls.push("export-db"); return Buffer.from(FAKE_DUMP_SQL, "utf8"); }
    if (command === "ssh" && joined.includes("table_prefix")) { calls.push("remote-facts-prefix"); return "wp_remote_"; }
    if (command === "ssh" && joined.includes("siteurl") && !joined.includes("remote.origin")) { calls.push("remote-facts-siteurl"); return "https://demo.staging.example.com"; }
    if (command === "ssh" && joined.includes("remote.origin.url")) { calls.push("discover-git"); return ""; }
    return "";
  };
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new NoToolCheckRemoteProfileService(profile, runner));

  const scaffoldCalls: any[] = [];
  const envService = {
    scaffold: async (_dir: string, _type: string, options: any) => { scaffoldCalls.push(options); },
    start: async () => {},
    importDb: async () => {},
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => {},
  } as any;

  const ctx: any = { targetDir, profile: resolvedProfile(), projectName: "demo", environment: "docker" };
  await runImportWorkflow({ source, ctx, targetDir, envService, resume: false });

  assert.ok(calls.includes("preflight-probe"), "preflight must run before anything else");
  assert.ok(calls.includes("sync-files"));
  assert.ok(calls.includes("export-db"));
  assert.ok(calls.includes("remote-facts-prefix"), "detect-prefix must consult the source's remote facts");
  assert.equal(scaffoldCalls[0].tablePrefix, "wp_remote_", "the remote-authoritative prefix must win over guessing from the dump");
  const link = await readLink(targetDir);
  assert.equal(link?.name, "demo", "link-profile must have written the project link");

  await fs.remove(targetDir);
});

test("end-to-end resume: a remote source's already-fetched dump and detected prefix survive --resume, matching local sources' behavior", async () => {
  const targetDir = await tempDir("acli-profile-source-resume-");
  const runner = async (command: string, args: string[] = []) => {
    const joined = args.join(" ");
    if (command === "rsync") return "";
    if (command === "ssh" && joined.includes("wp db export")) return Buffer.from(FAKE_DUMP_SQL, "utf8");
    if (command === "ssh" && joined.includes("table_prefix")) return "wp_";
    if (command === "ssh" && joined.includes("siteurl") && !joined.includes("remote.origin")) return "https://demo.staging.example.com";
    if (command === "ssh" && joined.includes("remote.origin.url")) return "";
    return "";
  };
  const source = createProfileImportSource("profile", "Staging profile", (profile) => new NoToolCheckRemoteProfileService(profile, runner));

  const failingEnv = { scaffold: async () => { throw new Error("simulated interruption"); } } as any;
  const ctx1: any = { targetDir, profile: resolvedProfile(), projectName: "demo", environment: "docker" };
  await assert.rejects(() => runImportWorkflow({ source, ctx: ctx1, targetDir, envService: failingEnv, resume: false }));
  assert.ok(await fs.pathExists(path.join(targetDir, "staging.sql")));

  const calls: string[] = [];
  const workingEnv = {
    scaffold: async (_dir: string, _type: string, options: any) => { calls.push("scaffold"); assert.equal(options.tablePrefix, "wp_"); },
    start: async () => { calls.push("start"); },
    importDb: async () => { calls.push("importDb"); },
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => { calls.push("searchReplace"); },
  } as any;
  const ctx2: any = { targetDir, profile: resolvedProfile(), projectName: "demo", environment: "docker" };
  await runImportWorkflow({ source, ctx: ctx2, targetDir, envService: workingEnv, resume: true });

  assert.ok(calls.includes("importDb"), "resumed run must still import the already-fetched remote dump");
  const link = await readLink(targetDir);
  assert.equal(link?.name, "demo", "link-profile must still run on the resumed attempt");

  await fs.remove(targetDir);
});
