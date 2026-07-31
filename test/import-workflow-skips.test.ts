import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { runImportWorkflow } from "../src/wordpress/import/ImportWorkflow.ts";
import type { ImportSource, ImportSourceContext } from "../src/wordpress/import/ImportSource.ts";
import type EnvironmentService from "../src/environments/EnvironmentService.ts";

/**
 * Ported from the deleted test/existing-wp-scaffold.test.js, which asserted
 * these behaviors against ExistingWPStrategy's own hand-rolled pipeline.
 * That pipeline is gone; the guarantees now live in the shared import
 * workflow instead of being duplicated inside the profile source.
 */

const DUMP = "CREATE TABLE `wp_options` (id INT);\nCREATE TABLE `wp_posts` (id INT);\nCREATE TABLE `wp_users` (id INT);";

async function tempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeSource(calls: string[]): ImportSource {
  return {
    label: "Fake source",
    async preflight() { calls.push("preflight"); },
    async fetchFiles() { calls.push("fetchFiles"); },
    async fetchDatabase(ctx: ImportSourceContext) {
      calls.push("fetchDatabase");
      await fs.writeFile(path.join(ctx.targetDir, "staging.sql"), DUMP);
      return { hasDump: true };
    },
    async linkProfile() { calls.push("linkProfile"); return "shared-host"; },
    async linkGit() { calls.push("linkGit"); },
  };
}

function makeEnvService(calls: string[]): EnvironmentService {
  return {
    scaffold: async () => { calls.push("scaffold"); },
    start: async () => {},
    importDb: async () => { calls.push("importDb"); },
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => {},
  } as unknown as EnvironmentService;
}

test("skipFiles/skipDatabase/skipGitLink each suppress only their own step", async () => {
  const targetDir = await tempDir("acli-import-skips-");
  const calls: string[] = [];
  const ctx: any = { targetDir, skipFiles: true, skipDatabase: true, skipGitLink: true };

  await runImportWorkflow({ source: makeSource(calls), ctx, targetDir, envService: makeEnvService(calls), resume: false });

  assert.ok(!calls.includes("fetchFiles"), "skipFiles must suppress the file transfer");
  assert.ok(!calls.includes("fetchDatabase"), "skipDatabase must suppress the database export");
  assert.ok(!calls.includes("linkGit"), "skipGitLink must suppress remote git discovery");
  // Everything not skipped still runs.
  assert.deepEqual(calls, ["preflight", "scaffold", "linkProfile"]);
  const gitignore = await fs.readFile(path.join(targetDir, ".gitignore"), "utf8");
  assert.match(gitignore, /^\/wp-config\.php$/m, "import must materialize the WordPress gitignore template even when Git linking is skipped");
  assert.match(gitignore, /^\.acli\/$/m);
  await fs.remove(targetDir);
});

test("--skip-git suppresses remote linking as well as later local initialization", async () => {
  const targetDir = await tempDir("acli-import-skip-git-");
  const calls: string[] = [];
  const ctx: any = { targetDir, skipGitInit: true };

  await runImportWorkflow({ source: makeSource(calls), ctx, targetDir, envService: makeEnvService(calls), resume: false });

  assert.ok(!calls.includes("linkGit"), "--skip-git must prevent linkGit from initializing a repository indirectly");
  await fs.remove(targetDir);
});

test("staging.sql is removed after a successful import so a dump of a real site is not left in the project", async () => {
  const targetDir = await tempDir("acli-import-cleanup-");
  const calls: string[] = [];
  const ctx: any = { targetDir };

  await runImportWorkflow({ source: makeSource(calls), ctx, targetDir, envService: makeEnvService(calls), resume: false });

  assert.ok(calls.includes("importDb"), "the dump must actually have been imported");
  assert.equal(await fs.pathExists(path.join(targetDir, "staging.sql")), false);
  await fs.remove(targetDir);
});

test("--keep-dump preserves staging.sql after the import", async () => {
  const targetDir = await tempDir("acli-import-keepdump-");
  const calls: string[] = [];
  const ctx: any = { targetDir, keepDump: true };

  await runImportWorkflow({ source: makeSource(calls), ctx, targetDir, envService: makeEnvService(calls), resume: false });

  assert.equal(await fs.pathExists(path.join(targetDir, "staging.sql")), true);
  await fs.remove(targetDir);
});

test("a failing step names which phase broke rather than surfacing only the raw error", async () => {
  const targetDir = await tempDir("acli-import-stepfail-");
  const calls: string[] = [];
  const source = { ...makeSource(calls), fetchFiles: async () => { throw new Error("rsync exited 23"); } };

  await assert.rejects(
    () => runImportWorkflow({ source, ctx: { targetDir } as any, targetDir, envService: makeEnvService(calls), resume: false }),
    (error: any) => {
      assert.match(error.message, /Fetching WordPress files/, "the failure must name the step");
      assert.equal(error.cause?.message, "rsync exited 23", "the original error must be preserved as the cause");
      return true;
    },
  );
  await fs.remove(targetDir);
});
