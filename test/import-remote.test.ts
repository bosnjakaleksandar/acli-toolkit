import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { SshHost } from "../src/providers/ssh/SshHost.ts";
import { resolveRemoteProfile } from "../src/providers/resolveProfile.ts";
import { buildImportPlan, runImportWorkflow } from "../src/wordpress/import/ImportWorkflow.ts";
import { linkDiscoveredGit } from "../src/wordpress/import/linkGit.ts";
import { importCtx } from "./helpers/importFakes.ts";
import { readLink } from "../src/profiles/ProjectLink.ts";
import { runCommand } from "../src/system/commandRunner.ts";
import { applyGitSshHostAlias, linkGitRemote } from "../src/system/git.ts";
import type { Profile } from "../src/core/model/Profile.ts";

/**
 * Import against a real SshHost (with a fake command runner): the workflow
 * end to end, the dry-run plan, and safe/unsafe Git-origin linking.
 */

const rawProfile: Profile = {
  type: "wordpress",
  ssh: { host: "demo.example.com", username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { targets: { uploads: { path: "wp-content/uploads" } } },
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

// preflight() checks real tool binaries (assertToolsAvailable) rather than the
// injected `runner` — real on ubuntu-latest (docker preinstalled) but not on
// macos-latest CI runners (no docker CLI at all). The two end-to-end tests
// below only care that runImportWorkflow's orchestration is correct, not
// that this host actually has docker, so they use this subclass to make
// preflight's tool check a no-op while still exercising the real ssh probe
// (via the already-mocked `runner`).
class NoToolCheckSshHost extends SshHost {
  requiredTools(): string[] {
    return [];
  }
}

test("linkGit fetches a safe origin, tracks its default branch, and preserves imported working files", async () => {
  // discoverGit() goes through the injected SshHost runner
  // (simulating the remote `git config --get remote.origin.url`), but the
  // local git binary on targetDir. Use an entirely local bare fixture so the
  // test proves fetch/upstream behavior without network access.
  const fixtureDir = await tempDir("acli-profile-source-remote-");
  const seedDir = path.join(fixtureDir, "seed");
  const remoteDir = path.join(fixtureDir, "remote.git");
  await fs.ensureDir(seedDir);
  await runCommand("git", ["init", "--initial-branch", "main"], { cwd: seedDir });
  await runCommand("git", ["config", "user.email", "tests@acli.local"], { cwd: seedDir });
  await runCommand("git", ["config", "user.name", "A-CLI tests"], { cwd: seedDir });
  await fs.writeFile(path.join(seedDir, "tracked.txt"), "remote baseline\n");
  await runCommand("git", ["add", "tracked.txt"], { cwd: seedDir });
  await runCommand("git", ["commit", "-m", "fixture baseline"], { cwd: seedDir });
  await runCommand("git", ["clone", "--bare", seedDir, remoteDir], { cwd: fixtureDir });

  const runner = async (command: string) => (command === "ssh" ? remoteDir : "");
  const targetDir = await tempDir("acli-profile-source-git-");
  await fs.writeFile(path.join(targetDir, "tracked.txt"), "imported staging version\n");

  const ctx = importCtx(targetDir, { profile: resolvedProfile() });
  const result: any = await linkDiscoveredGit(new SshHost(ctx.profile, runner as any), targetDir, ctx);

  assert.equal(ctx.skipGitInit, undefined, "linking must not disguise an initialized repository as skipped");
  assert.equal(ctx.gitStatus, "Linked to origin/main (pull-only)");
  assert.equal(result.trackingBranch, "main");
  assert.ok(await fs.pathExists(path.join(targetDir, ".git")), "git init must have run against targetDir");
  const remoteUrl = (await runCommand("git", ["remote", "get-url", "origin"], { cwd: targetDir })) as string;
  assert.equal(remoteUrl.trim(), remoteDir);
  const upstream = await runCommand("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], { cwd: targetDir });
  assert.equal(upstream, "origin/main");
  assert.equal(await fs.readFile(path.join(targetDir, "tracked.txt"), "utf8"), "imported staging version\n", "linking must not checkout over imported files");

  await fs.remove(targetDir);
  await fs.remove(fixtureDir);
});

test("linkGit refuses a credential-bearing remote git origin URL and never runs git remote add with it", async () => {
  const calls: string[][] = [];
  const runner = async (command: string, args: string[] = []) => {
    calls.push([command, ...args]);
    if (command === "ssh") return "https://x-access-token:ghp_SECRET@github.com/example/repo.git";
    return "";
  };
  const targetDir = await tempDir("acli-profile-source-git-unsafe-");

  const ctx = importCtx(targetDir, { profile: resolvedProfile() });
  const spinnerCalls: string[] = [];
  await linkDiscoveredGit(new SshHost(ctx.profile, runner as any), targetDir, ctx, { spinner: { message: (text: string) => spinnerCalls.push(text) } });

  assert.equal(ctx.gitStatus, undefined, "must not mark git as linked when the origin URL was rejected");
  assert.ok(!calls.some((call) => call[0] === "git" && call[1] === "remote"), "git remote add must never run with an unsafe URL");
  assert.ok(spinnerCalls.some((msg) => msg.includes("unsafe") && !msg.includes("ghp_SECRET")), "the skip message must not reproduce the credential");

  await fs.remove(targetDir);
});

test("a profile-local SSH Host alias rewrites only SSH Git remote hosts", async () => {
  assert.equal(applyGitSshHostAlias("git@github.com:agency/site.git", "github-work"), "git@github-work:agency/site.git");
  assert.equal(applyGitSshHostAlias("ssh://git@github.com:2222/agency/site.git", "github-work"), "ssh://git@github-work:2222/agency/site.git");
  assert.equal(applyGitSshHostAlias("https://github.com/agency/site.git", "github-work"), "https://github.com/agency/site.git");
  assert.throws(() => applyGitSshHostAlias("git@github.com:agency/site.git", "-oProxyCommand=bad"), /Invalid Git SSH host alias/);

  const rawUrl = "git@github.com:agency/site.git";
  const remoteRunner = async (command: string) => command === "ssh" ? rawUrl : "";
  let linkedUrl = "";
  let previousUrl = "";
  const gitLinker = async (_targetDir: string, remoteUrl: string, _runner: unknown, options?: { previousRemoteUrl?: string }) => {
    linkedUrl = remoteUrl;
    previousUrl = options?.previousRemoteUrl || "";
    return { initialized: true, remoteLinked: true, trackingBranch: "main", summary: "Linked to origin/main (pull-only)" };
  };
  const ctx = importCtx("/tmp/unused", { profile: resolvedProfile({ git: { enabled: true, sshHostAlias: "github-work" } }) });
  await linkDiscoveredGit(new SshHost(ctx.profile, remoteRunner as any), ctx.targetDir, ctx, { gitLinker: gitLinker as any });
  assert.equal(linkedUrl, "git@github-work:agency/site.git");
  assert.equal(previousUrl, rawUrl, "resume may replace only the exact URL discovered before alias mapping");
});

test("resume replaces only the previously discovered origin with its configured SSH alias", async () => {
  const targetDir = await tempDir("acli-git-alias-resume-");
  await fs.ensureDir(path.join(targetDir, ".git"));
  const calls: string[][] = [];
  const original = "git@github.com:agency/site.git";
  const aliased = "git@github-work:agency/site.git";
  const runner: any = async (_command: string, args: string[]) => {
    calls.push(args);
    if (args.join(" ") === "remote get-url origin") return original;
    if (args.join(" ") === "ls-remote --symref origin HEAD") return "ref: refs/heads/main\tHEAD\nabc\tHEAD";
    return "";
  };

  await linkGitRemote(targetDir, aliased, runner, { previousRemoteUrl: original });
  assert.ok(calls.some((args) => args.join(" ") === `remote set-url origin ${aliased}`));
  assert.ok(!calls.some((args) => args[0] === "push" || args[0] === "send-pack"));

  await assert.rejects(
    linkGitRemote(targetDir, aliased, async (_command, args = []) => args.join(" ") === "remote get-url origin" ? "git@elsewhere:other/repo.git" : "", { previousRemoteUrl: original }),
    /different origin/,
  );
  await fs.remove(targetDir);
});

test("Git public-key failures point to the profile-local SSH alias command and exact resume command", async () => {
  const rawUrl = "git@github.com:agency/site.git";
  const remoteRunner = async (command: string) => command === "ssh" ? rawUrl : "";
  const gitLinker = async () => {
    const error: any = new Error("Command failed");
    error.stderr = "git@github.com: Permission denied (publickey).";
    throw error;
  };
  const profile = { ...resolveRemoteProfile({ ...rawProfile, git: { enabled: true } }, { projectName: "client-site" }), profileName: "agency-staging" };
  const ctx = importCtx("/tmp/unused", { profile });

  await assert.rejects(
    linkDiscoveredGit(new SshHost(profile, remoteRunner as any), ctx.targetDir, ctx, { gitLinker: gitLinker as any, resumeCommand: "acli import 'Client Site' --resume --name client-site" }),
    (error: any) => {
      assert.equal(error.code, "GIT_AUTH_FAILED");
      assert.match(error.hint, /acli profile git-alias agency-staging <alias>`/);
      assert.doesNotMatch(error.hint, /--scope/);
      assert.match(error.hint, /acli import 'Client Site' --resume --name client-site/);
      return true;
    },
  );
});

test("buildImportPlan reports the remote target, transports and required tools for --dry-run", async () => {
  const profile = { ...resolveRemoteProfile(rawProfile, { projectName: "demo" }), profileName: "demo" };
  const plan = buildImportPlan(importCtx("/tmp/unused", { profile, projectName: "demo" }), new SshHost(profile));

  assert.equal(plan.profile, "demo");
  assert.equal(plan.remoteHost, "demo.example.com");
  assert.equal(plan.remoteWordPressRoot, "/srv/demo/wordpress");
  assert.equal(plan.databaseDriver, "wp-cli");
  assert.equal(plan.fileTransfer, "rsync");
  assert.equal(plan.gitLink, true);
  assert.deepEqual(plan.requiredTools, ["ssh", "docker", "rsync"]);
});

test("buildImportPlan falls back to the profile's own urls.staging when no --remote-url was supplied", async () => {
  const profile = resolveRemoteProfile({ ...rawProfile, urls: { staging: "https://demo.staging.example.com" } }, { projectName: "demo" });
  const base = importCtx("/tmp/unused", { profile, projectName: "demo" });

  const fallback = buildImportPlan(base, new SshHost(profile));
  assert.equal(fallback.stagingUrl, "https://demo.staging.example.com", "the profile's declared staging URL is an extra search-replace source");

  const explicit = buildImportPlan({ ...base, stagingUrl: "https://override.example.com" }, new SshHost(profile));
  assert.equal(explicit.stagingUrl, "https://override.example.com", "an explicit --remote-url wins over the profile default");
});

test("end-to-end via runImportWorkflow: preflight, prefix detection (remote-authoritative), scaffold, link-profile, link-git, and import all run against the ssh provider", async () => {
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
  const remote = new NoToolCheckSshHost(resolvedProfile(), runner as any);

  const scaffoldCalls: any[] = [];
  const envService = {
    scaffold: async (_dir: string, _type: string, options: any) => { scaffoldCalls.push(options); },
    start: async () => {},
    importDb: async () => {},
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => {},
  } as any;

  const ctx = importCtx(targetDir, { profile: resolvedProfile(), projectName: "demo" });
  await runImportWorkflow({ remote, ctx, targetDir, envService, resume: false });

  assert.ok(calls.includes("preflight-probe"), "preflight must run before anything else");
  assert.ok(calls.includes("sync-files"));
  assert.ok(calls.includes("export-db"));
  assert.ok(calls.includes("remote-facts-prefix"), "detect-prefix must consult the provider's remote facts");
  assert.equal(scaffoldCalls[0].tablePrefix, "wp_remote_", "the remote-authoritative prefix must win over guessing from the dump");
  const link = await readLink(targetDir);
  assert.equal(link?.name, "demo", "link-profile must have written the project link");

  await fs.remove(targetDir);
});

test("end-to-end resume: an already-fetched remote dump and detected prefix survive --resume", async () => {
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
  const remote = new NoToolCheckSshHost(resolvedProfile(), runner as any);

  const failingEnv = { scaffold: async () => { throw new Error("simulated interruption"); } } as any;
  const ctx1 = importCtx(targetDir, { profile: resolvedProfile(), projectName: "demo" });
  await assert.rejects(() => runImportWorkflow({ remote, ctx: ctx1, targetDir, envService: failingEnv, resume: false }));
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
  const ctx2 = importCtx(targetDir, { profile: resolvedProfile(), projectName: "demo" });
  await runImportWorkflow({ remote, ctx: ctx2, targetDir, envService: workingEnv, resume: true });

  assert.ok(calls.includes("importDb"), "resumed run must still import the already-fetched remote dump");
  const link = await readLink(targetDir);
  assert.equal(link?.name, "demo", "link-profile must still run on the resumed attempt");

  await fs.remove(targetDir);
});
