import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { runImportWorkflow } from "../src/features/import/ImportWorkflow.ts";
import type { ImportSource, ImportSourceContext } from "../src/features/import/ImportSource.ts";

/**
 * Regression coverage for phase 1c: ImportWorkflow used to track "was a
 * dump fetched" in a `let hasDump = false` closure local to a single call.
 * On --resume, "fetch-database" is skipped (already completed in the prior
 * run) so that assignment never re-runs — the *resumed* call's closure
 * starts back at false, and the run silently skips importing a dump that
 * was already sitting on disk. Whether a dump exists is now derived from
 * `<targetDir>/staging.sql` itself, which survives across calls.
 */

async function tempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeFakeSource(sql: string): ImportSource {
  return {
    id: "fake",
    label: "Fake source",
    async fetchFiles() {},
    async fetchDatabase(ctx: ImportSourceContext) {
      await fs.writeFile(path.join(ctx.targetDir, "staging.sql"), sql);
      return { hasDump: true };
    },
  };
}

test("a --resume run still imports a database dump that was fetched in the interrupted run, even though 'fetch-database' itself is skipped", async () => {
  const targetDir = await tempDir("acli-import-resume-");
  const source = makeFakeSource("CREATE TABLE `wp_options` (id INT);\nCREATE TABLE `wp_postmeta` (id INT);");

  // First attempt: fetch-files, fetch-database, and detect-prefix all
  // succeed and get persisted; scaffold-environment then fails, simulating
  // an interruption after the dump has already landed on disk.
  const failingEnvService = {
    scaffold: async () => { throw new Error("simulated interruption"); },
  };
  const ctx1: any = { targetDir };
  await assert.rejects(() => runImportWorkflow({ source, ctx: ctx1, targetDir, envService: failingEnvService as any, resume: false }));
  assert.ok(await fs.pathExists(path.join(targetDir, "staging.sql")), "the dump must have been persisted before the simulated failure");

  // Resumed attempt: fetch-files/fetch-database/detect-prefix are skipped
  // (already completed) — a fresh ctx2 and a fresh call means any
  // in-memory-only signal from the first call is gone.
  const calls: string[] = [];
  let seenPrefix: unknown;
  const workingEnvService = {
    scaffold: async (_dir: string, _type: string, options: any) => { calls.push("scaffold"); seenPrefix = options.tablePrefix; },
    start: async () => { calls.push("start"); },
    importDb: async () => { calls.push("importDb"); },
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => { calls.push("searchReplace"); },
  };
  const ctx2: any = { targetDir };
  await runImportWorkflow({ source, ctx: ctx2, targetDir, envService: workingEnvService as any, resume: true });

  assert.ok(calls.includes("importDb"), "the resumed run must still import the already-fetched dump, not silently skip it");
  assert.ok(calls.includes("searchReplace"));
  assert.equal(seenPrefix, "wp_", "the prefix detected (and persisted) in the interrupted run must still reach scaffold() on resume, via onSkip rehydration");

  await fs.remove(targetDir);
});

test("a --resume run with --skip-database (no dump ever fetched) does not attempt to import on resume either", async () => {
  const targetDir = await tempDir("acli-import-resume-skipdb-");
  const source: ImportSource = {
    id: "fake-skip",
    label: "Fake source",
    async fetchFiles() {},
    async fetchDatabase() { throw new Error("must not be called when skipDatabase is set"); },
  };

  const failingEnvService = { scaffold: async () => { throw new Error("simulated interruption"); } };
  const ctx1: any = { targetDir, skipDatabase: true };
  await assert.rejects(() => runImportWorkflow({ source, ctx: ctx1, targetDir, envService: failingEnvService as any, resume: false }));
  assert.equal(await fs.pathExists(path.join(targetDir, "staging.sql")), false);

  const calls: string[] = [];
  const workingEnvService = {
    scaffold: async () => { calls.push("scaffold"); },
    start: async () => { calls.push("start"); },
    importDb: async () => { calls.push("importDb"); },
    getLocalUrl: () => "http://localhost:8080",
    wp: async () => "",
    searchReplace: async () => { calls.push("searchReplace"); },
  };
  const ctx2: any = { targetDir, skipDatabase: true };
  await runImportWorkflow({ source, ctx: ctx2, targetDir, envService: workingEnvService as any, resume: true });

  assert.ok(!calls.includes("importDb"), "no dump was ever fetched, so resume must not attempt an import");
  await fs.remove(targetDir);
});
