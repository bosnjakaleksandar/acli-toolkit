import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getGitignore, mergeGitignoreContents, mergeGitignoreForImport, reconcileGitignore } from "../src/system/gitignore.ts";
import { searchReplacePairs } from "../src/wordpress/migration/WordPressMigration.ts";
import { normalizeSqlDumpFile } from "../src/wordpress/migration/sqlNormalization.ts";
import DockerComposeService from "../src/environments/DockerEnvironment.ts";
import { linkDiscoveredGit } from "../src/wordpress/import/linkGit.ts";
import { importCtx, fakeRemote } from "./helpers/importFakes.ts";

const tempDir = (prefix: string) => fs.mkdtemp(path.join(os.tmpdir(), prefix));
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd, stdio: "pipe" }).toString();

test("gitignore: a committed file that already has every rule is left byte for byte", async () => {
  const template = await getGitignore("wordpress");
  const merged = mergeGitignoreContents("", template, "/custom-cache/\n");

  const crlf = merged.replace(/\n/g, "\r\n");
  assert.equal(reconcileGitignore("", template, crlf), crlf, "CRLF line endings are not rewritten");

  const reordered = merged.replace(".acli/\n", "").replace("/custom-cache/\n", "/custom-cache/\n.acli/\n");
  assert.equal(reconcileGitignore("", template, reordered), reordered, "a hand-reordered file is not rewritten");

  const noFinalNewline = merged.trimEnd();
  assert.equal(reconcileGitignore("", template, noFinalNewline), noFinalNewline);
});

test("gitignore: a file missing template rules is rebuilt, keeping its CRLF endings", async () => {
  const template = await getGitignore("wordpress");
  const result = reconcileGitignore("", template, "/custom-cache/\r\nnode_modules\r\n");
  assert.ok(result.includes("/wp-config.php\r\n"));
  assert.ok(!/[^\r]\n/.test(result), "every line ends in CRLF");
  assert.match(result, /\/custom-cache\//);
});

test("gitignore: import → commit → re-import → pull leaves the working tree clean", async () => {
  const root = await tempDir("acli-gitignore-cycle-");
  const origin = path.join(root, "origin.git");
  git(root, "init", "-q", "-b", "main", "--bare", origin);
  const seed = path.join(root, "seed");
  await fs.ensureDir(seed);
  git(seed, "init", "-q", "-b", "main");
  await fs.writeFile(path.join(seed, ".gitignore"), "node_modules\n!wp-content/plugins/custom/\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "init");
  git(seed, "push", "-q", origin, "HEAD:refs/heads/main");

  const clone = async (name: string) => {
    const dir = path.join(root, name);
    git(root, "clone", "-q", origin, dir);
    await fs.remove(path.join(dir, ".gitignore")); // an import never checks files out
    git(dir, "reset", "-q", "--mixed");
    return dir;
  };

  const first = await clone("first");
  await mergeGitignoreForImport(first, "wordpress");
  git(first, "add", ".gitignore");
  git(first, "commit", "-qm", "gitignore");
  git(first, "push", "-q", "origin", "HEAD:main");

  const second = await clone("second");
  await mergeGitignoreForImport(second, "wordpress");
  assert.equal(git(second, "status", "--porcelain"), "", "re-import must not modify the committed .gitignore");
  await mergeGitignoreForImport(second, "wordpress");
  assert.equal(git(second, "status", "--porcelain"), "", "a pull must not modify it either");
  await fs.remove(root);
});

test("search-replace covers JSON-escaped URLs and trailing slashes, longest first", () => {
  const pairs = searchReplacePairs(["https://staging.example.com/", "https://staging.example.com/blog"], "http://localhost:8080/");
  assert.deepEqual(pairs[0], ["https://staging.example.com/blog", "http://localhost:8080"]);
  assert.ok(pairs.some(([from, to]) => from === "https://staging.example.com" && to === "http://localhost:8080"));
  assert.ok(pairs.some(([from, to]) => from === "http://staging.example.com" && to === "http://localhost:8080"));
  assert.ok(pairs.some(([from, to]) => from === "https:\\/\\/staging.example.com" && to === "http:\\/\\/localhost:8080"), "Elementor/Gutenberg store escaped URLs");
  assert.ok(!pairs.some(([from]) => from.endsWith("/")), "no source keeps a trailing slash");
  assert.ok(!pairs.some(([from]) => from === "http://localhost:8080"));
});

test("SQL normalization rewrites MySQL 8 collations that MariaDB and MySQL 5.7 reject", async () => {
  const dir = await tempDir("acli-collations-");
  const file = path.join(dir, "staging.sql");
  await fs.writeFile(file, "CREATE TABLE t (a TEXT) COLLATE=utf8mb4_0900_ai_ci;\nCREATE TABLE u (b TEXT COLLATE utf8mb4_0900_bin);\n");
  await normalizeSqlDumpFile(file);
  const sql = await fs.readFile(file, "utf8");
  assert.doesNotMatch(sql, /0900/);
  assert.match(sql, /utf8mb4_unicode_520_ci/);
  assert.match(sql, /utf8mb4_bin/);
  await fs.remove(dir);
});

test("docker import picks one client and never re-runs a failed dump through another", async () => {
  const calls: string[][] = [];
  const service = new DockerComposeService({ runner: async (_command: string, args: string[] = []) => { calls.push(args); return ""; } });
  await (service as any).importDbOnce("/tmp/project", "staging.sql");
  const script = calls.at(-1)!.at(-1)!;
  assert.match(script, /command -v mariadb/);
  assert.doesNotMatch(script, /2>\/dev\/null \|\|/, "a real SQL error must not be hidden behind a fallback client");
  assert.match(script, /max_allowed_packet=1G/);
});

test("a theme repository is linked in its own folder, not at the WordPress root", async () => {
  const targetDir = await tempDir("acli-theme-link-");
  const linked: string[] = [];
  const remote = fakeRemote({ overrides: { async discoverGit() { return { directory: "wp-content/themes/{projectName}", url: "git@github.com:acme/theme.git" }; } } });
  const ctx = importCtx(targetDir);
  const gitLinker = async (dir: string) => { linked.push(dir); return { initialized: true, remoteLinked: true, trackingBranch: "main", summary: "Linked" }; };
  await linkDiscoveredGit(remote, targetDir, ctx, { gitLinker: gitLinker as any });
  assert.deepEqual(linked, [path.join(targetDir, "wp-content", "themes", "client-site")]);
  assert.equal(ctx.gitRepoDirectory, "wp-content/themes/client-site");

  const unsafe = fakeRemote({ overrides: { async discoverGit() { return { directory: "../../etc", url: "git@github.com:acme/theme.git" }; } } });
  assert.equal(await linkDiscoveredGit(unsafe, targetDir, importCtx(targetDir), { gitLinker: gitLinker as any }), null);
  assert.equal(linked.length, 1);
  await fs.remove(targetDir);
});
