import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { runImportWorkflow } from "../src/wordpress/import/ImportWorkflow.ts";
import type { ImportSource, ImportSourceContext } from "../src/wordpress/import/ImportSource.ts";
import type EnvironmentService from "../src/environments/EnvironmentService.ts";

/**
 * Regression coverage for phase 1b: ImportWorkflow used to scaffold the
 * local environment (which templates the table prefix into
 * docker-compose.yaml/.lando.yml) *before* detecting the prefix, so any
 * site with a non-default prefix got an environment silently pointed at the
 * wrong tables (falling back to "wp_"). ExistingWPStrategy.scaffold already
 * got this ordering right — this asserts ImportWorkflow now matches it.
 */

async function tempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeFakeSource(sql: string): ImportSource {
  return {
    label: "Fake source",
    async fetchFiles() {},
    async fetchDatabase(ctx: ImportSourceContext) {
      await fs.writeFile(path.join(ctx.targetDir, "staging.sql"), sql);
      return { hasDump: true };
    },
  };
}

function makeFakeEnvService(scaffoldSpy: (options: any) => void): EnvironmentService {
  return {
    scaffold: async (_dir: string, _type: string, options: any) => { scaffoldSpy(options); },
    start: async () => {},
    importDb: async () => {},
    getLocalUrl: () => "http://localhost:8080",
    wp: async (_dir: string, args: string[]) => (args.join(" ") === "option get siteurl" ? "http://localhost:8080" : ""),
    searchReplace: async () => {},
  } as unknown as EnvironmentService;
}

test("detects the table prefix before scaffolding, so the local environment is templated with the real prefix instead of defaulting to wp_", async () => {
  const targetDir = await tempDir("acli-import-order-");
  const source = makeFakeSource("CREATE TABLE `xyz_options` (id INT);\nCREATE TABLE `xyz_postmeta` (id INT);");
  let seenPrefix: unknown;
  const envService = makeFakeEnvService((options) => { seenPrefix = options.tablePrefix; });
  const ctx: any = { targetDir };

  await runImportWorkflow({ source, ctx, targetDir, envService, resume: false });

  assert.equal(seenPrefix, "xyz_", "scaffold() must already see the detected prefix, not undefined/the wp_ default");
  assert.equal(ctx.tablePrefix, "xyz_");
  await fs.remove(targetDir);
});

test("scaffolds normally (with the wp_ default) when the source supplies no database dump", async () => {
  const targetDir = await tempDir("acli-import-order-nodump-");
  const source: ImportSource = {
    label: "Fake source (no dump)",
    async fetchFiles() {},
    async fetchDatabase() { return { hasDump: false }; },
  };
  let seenPrefix: unknown = "unset";
  const envService = makeFakeEnvService((options) => { seenPrefix = options.tablePrefix; });
  const ctx: any = { targetDir };

  await runImportWorkflow({ source, ctx, targetDir, envService, resume: false });

  assert.equal(seenPrefix, undefined, "no dump means no prefix to detect — envService.scaffold itself owns the wp_ fallback");
  await fs.remove(targetDir);
});
