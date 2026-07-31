import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { createProfileImportSource } from "../src/wordpress/import/sources/RemoteSource.ts";
import { RemoteHost } from "../src/remote/RemoteHost.ts";
import { resolveRemoteProfile } from "../src/remote/resolveProfile.ts";
import { runImportWorkflow } from "../src/wordpress/import/ImportWorkflow.ts";
import { readLink } from "../src/profiles/ProjectLink.ts";
import { runCommand } from "../src/system/commandRunner.ts";
import { applyGitSshHostAlias, linkGitRemote } from "../src/system/git.ts";
import type { Profile } from "../src/core/model/Profile.ts";

/**
 * Coverage for the saved-profile ImportSource running through the shared
 * ImportWorkflow/StepRunner instead of delegating to a second create path.
 * The implementation reproduces what ExistingWPStrategy used to do
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
class NoToolCheckRemoteHost extends RemoteHost {
  requiredTools(): string[] {
    return [];
  }
}

test("fetchFiles delegates to RemoteHost.syncFiles and is skipped when skipFiles is set", async () => {
  const calls: string[] = [];
  const runner = async (command: string, args: string[] = []) => { calls.push(command); return ""; };
  const source = createProfileImportSource((profile) => new RemoteHost(profile, runner));
  const targetDir = await tempDir("acli-profile-source-files-");

  await source.fetchFiles({ targetDir, profile: resolvedProfile(), skipFiles: true } as any);
  assert.equal(calls.length, 0, "skipFiles must prevent any sync call");

  await source.fetchFiles({ targetDir, profile: resolvedProfile(), skipFiles: false } as any);
  assert.ok(calls.includes("rsync"), "fetchFiles must sync via rsync when not skipped");

  await fs.remove(targetDir);
});

test("fetchDatabase delegates to RemoteHost.exportDatabase, writing staging.sql", async () => {
  const runner = async () => Buffer.alloc(200, 1);
  const source = createProfileImportSource((profile) => new RemoteHost(profile, runner));
  const targetDir = await tempDir("acli-profile-source-db-");

  const result = await source.fetchDatabase({ targetDir, profile: resolvedProfile() } as any);
  assert.equal(result.hasDump, true);
  assert.ok(await fs.pathExists(path.join(targetDir, "staging.sql")));

  await fs.remove(targetDir);
});

test("getRemoteFacts delegates to RemoteHost.getRemoteFacts (wp-cli driver)", async () => {
  const runner = async (_command: string, args: string[] = []) => {
    const remoteCommand = args.at(-1) as string;
    if (remoteCommand.includes("table_prefix")) return "wp_demo_";
    if (remoteCommand.includes("siteurl")) return "https://demo.staging.example.com";
    return "";
  };
  const source = createProfileImportSource((profile) => new RemoteHost(profile, runner));
  const facts = await source.getRemoteFacts!({ targetDir: "/tmp/unused", profile: resolvedProfile() } as any);
  assert.deepEqual(facts, { tablePrefix: "wp_demo_", siteUrl: "https://demo.staging.example.com" });
});

test("linkProfile writes the .acli project link and returns the profile name", async () => {
  const source = createProfileImportSource();
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

test("linkGit fetches a safe origin, tracks its default branch, and preserves imported working files", async () => {
  // discoverGit() goes through the injected RemoteHost runner
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
  const source = createProfileImportSource((profile) => new RemoteHost(profile, runner));
  const targetDir = await tempDir("acli-profile-source-git-");
  await fs.writeFile(path.join(targetDir, "tracked.txt"), "imported staging version\n");

  const ctx: any = { targetDir, profile: resolvedProfile() };
  const result: any = await source.linkGit!(targetDir, ctx, null);

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
  const source = createProfileImportSource((profile) => new RemoteHost(profile, runner));
  const targetDir = await tempDir("acli-profile-source-git-unsafe-");

  const ctx: any = { targetDir, profile: resolvedProfile() };
  const spinnerCalls: string[] = [];
  await source.linkGit!(targetDir, ctx, { message: (text: string) => spinnerCalls.push(text) });

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
  const source = createProfileImportSource(
    (profile) => new RemoteHost(profile, remoteRunner),
    async (_targetDir, remoteUrl, _runner, options) => {
      linkedUrl = remoteUrl;
      previousUrl = options?.previousRemoteUrl || "";
      return { initialized: true, remoteLinked: true, trackingBranch: "main", summary: "Linked to origin/main (pull-only)" };
    },
  );
  const ctx: any = { targetDir: "/tmp/unused", profile: resolvedProfile({ git: { enabled: true, sshHostAlias: "github-work" } }) };
  await source.linkGit!(ctx.targetDir, ctx, null);
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
  const source = createProfileImportSource(
    (profile) => new RemoteHost(profile, remoteRunner),
    async () => {
      const error: any = new Error("Command failed");
      error.stderr = "git@github.com: Permission denied (publickey).";
      throw error;
    },
  );
  const profile = resolveRemoteProfile({ ...rawProfile, profileName: "agency-staging", git: { enabled: true } }, { projectName: "client-site" });
  const ctx: any = { targetDir: "/tmp/unused", projectName: "client-site", profile };

  await assert.rejects(
    source.linkGit!(ctx.targetDir, ctx, null),
    (error: any) => {
      assert.equal(error.code, "GIT_AUTH_FAILED");
      assert.match(error.hint, /acli profile git-alias agency-staging <alias> --scope user/);
      assert.match(error.hint, /acli import --resume --name client-site/);
      return true;
    },
  );
});

test("buildPlan reports the remote target, transports and required tools for --dry-run", async () => {
  const source = createProfileImportSource();
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

test("buildPlan falls back to the profile's own urls.staging when no --remote-url was supplied", async () => {
  const source = createProfileImportSource();
  const withStagingUrl = { ...rawProfile, profileName: "demo", urls: { staging: "https://demo.staging.example.com" } };
  const profile = resolveRemoteProfile(withStagingUrl, { projectName: "demo" });
  const base = { targetDir: "/tmp/unused", profile, projectName: "demo", environment: "docker" };

  const fallback = source.buildPlan!(base as any) as Record<string, unknown>;
  assert.equal(fallback.stagingUrl, "https://demo.staging.example.com", "the profile's declared staging URL is an extra search-replace source");

  const explicit = source.buildPlan!({ ...base, stagingUrl: "https://override.example.com" } as any) as Record<string, unknown>;
  assert.equal(explicit.stagingUrl, "https://override.example.com", "an explicit --remote-url wins over the profile default");
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
  const source = createProfileImportSource((profile) => new NoToolCheckRemoteHost(profile, runner));

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
  const source = createProfileImportSource((profile) => new NoToolCheckRemoteHost(profile, runner));

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
