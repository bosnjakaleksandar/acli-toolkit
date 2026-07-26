import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import WordPressMigrationService from "../src/wordpress/migration/WordPressMigration.ts";
import { CliError } from "../src/core/errors.ts";

function makeFakeEnvService({ importedSiteUrl = "https://demo.staging.example.com", localUrl = "http://localhost:8080", failImport = false, failWp = false } = {}) {
  const calls = [];
  return {
    calls,
    getLocalUrl: () => localUrl,
    start: async () => { calls.push({ op: "start" }); },
    importDb: async (targetDir, sqlFile) => {
      calls.push({ op: "importDb", sqlFile });
      if (failImport) throw new Error("import failed");
    },
    wp: async (targetDir, args) => {
      calls.push({ op: "wp", args });
      if (failWp) throw new Error("wp-cli unavailable");
      if (args.join(" ") === "option get siteurl") return importedSiteUrl;
      return "";
    },
    searchReplace: async (targetDir, from, to) => { calls.push({ op: "searchReplace", from, to }); },
  };
}

async function withDump(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-migration-"));
  await fs.writeFile(path.join(directory, "staging.sql"), "CREATE TABLE `wp_options` (id INT);");
  try {
    await run(directory);
  } finally {
    await fs.remove(directory);
  }
}

test("search-replaces the imported site's actual URL (read from the freshly imported DB) rather than trusting the pre-declared staging URL", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ importedSiteUrl: "https://real-site-on-staging.example.com" });
    const migration = new WordPressMigrationService(envService);
    const ctx = { projectName: "demo", stagingUrl: "https://demo.staging.example.com", profile: { profileName: "shared-host" } };
    await migration.importAndReplace(dir, ctx, null);

    const replacements = envService.calls.filter((call) => call.op === "searchReplace").map((call) => call.from);
    assert.ok(replacements.includes("https://real-site-on-staging.example.com"), "must search-replace the actual imported siteurl");
  });
});

test("also search-replaces the http/https scheme variant of each source URL", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ importedSiteUrl: "https://real-site.example.com" });
    const migration = new WordPressMigrationService(envService);
    await migration.importAndReplace(dir, { projectName: "demo", profile: {} }, null);
    const replacements = envService.calls.filter((call) => call.op === "searchReplace").map((call) => call.from);
    assert.ok(replacements.includes("https://real-site.example.com"));
    assert.ok(replacements.includes("http://real-site.example.com"));
  });
});

test("includes stagingUrl and additionalSearchReplace as extra fallback sources, not the primary source", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ importedSiteUrl: "https://actual.example.com" });
    const migration = new WordPressMigrationService(envService);
    const ctx = {
      projectName: "demo",
      stagingUrl: "https://declared-staging.example.com",
      profile: { urls: { additionalSearchReplace: ["http://legacy.example.com"] } },
    };
    await migration.importAndReplace(dir, ctx, null);
    const replacements = envService.calls.filter((call) => call.op === "searchReplace").map((call) => call.from);
    assert.ok(replacements.includes("https://actual.example.com"));
    assert.ok(replacements.includes("https://declared-staging.example.com"));
    assert.ok(replacements.includes("http://legacy.example.com"));
  });
});

test("never search-replaces the local URL onto itself", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ importedSiteUrl: "http://localhost:8080", localUrl: "http://localhost:8080" });
    const migration = new WordPressMigrationService(envService);
    await migration.importAndReplace(dir, { projectName: "demo", profile: {} }, null);
    const replacements = envService.calls.filter((call) => call.op === "searchReplace").map((call) => call.from);
    assert.ok(!replacements.includes("http://localhost:8080"));
  });
});

test("works without any staging URL declared at all (relies solely on the imported siteurl)", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ importedSiteUrl: "https://only-known-after-import.example.com" });
    const migration = new WordPressMigrationService(envService);
    await migration.importAndReplace(dir, { projectName: "demo", profile: {} }, null);
    const replacements = envService.calls.filter((call) => call.op === "searchReplace").map((call) => call.from);
    assert.ok(replacements.includes("https://only-known-after-import.example.com"));
  });
});

test("a failed import is fatal and preserves the dump with a resume command", async () => {
  await withDump(async (dir) => {
    const envService = makeFakeEnvService({ failImport: true });
    const migration = new WordPressMigrationService(envService);
    const ctx = { projectName: "demo", presetName: "client-recipe", profile: { profileName: "shared-host" } };
    await assert.rejects(
      () => migration.importAndReplace(dir, ctx, null),
      (error) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /import failed/);
        assert.match(error.message, /Database dump preserved/);
        assert.match(error.message, /acli create --resume --preset client-recipe --profile shared-host --name demo --skip-files --keep-dump/);
        return true;
      },
    );
    assert.ok(await fs.pathExists(path.join(dir, "staging.sql")), "dump must survive a failed import");
  });
});

test("regression: preserves the real stderr from a failed command instead of just its generic 'Command failed' message", async () => {
  // CommandError's .message is only ever "Command failed: <argv>" — the
  // actual diagnostic lives in .stderr/.stdout. A prior version of this
  // catch block discarded those when wrapping the error, so users only ever
  // saw "Command failed: docker compose exec ... wp option get siteurl"
  // with no indication of why.
  await withDump(async (dir) => {
    const envService = makeFakeEnvService();
    envService.wp = async (targetDir, args) => {
      if (args.join(" ") === "option get siteurl") {
        const error = new Error("Command failed: docker compose exec -T -u www-data wordpress wp option get siteurl");
        error.stderr = "Error: WordPress database error Table 'wordpress.wp_options' doesn't exist for query...";
        throw error;
      }
      return "";
    };
    const migration = new WordPressMigrationService(envService);
    await assert.rejects(
      () => migration.importAndReplace(dir, { projectName: "demo", profile: {} }, null),
      (error) => {
        assert.match(error.message, /doesn't exist for query/);
        return true;
      },
    );
  });
});

test("throws immediately when staging.sql was never created", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-migration-nodump-"));
  const migration = new WordPressMigrationService(makeFakeEnvService());
  await assert.rejects(() => migration.importAndReplace(directory, { projectName: "demo", profile: {} }, null), (error) => {
    assert.equal(error.code, "DUMP_MISSING");
    return true;
  });
  await fs.remove(directory);
});

test("applies SQL normalization to the dump before importing (e.g. neutralizes CREATE DATABASE)", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-migration-normalize-"));
  await fs.writeFile(path.join(directory, "staging.sql"), "CREATE DATABASE `remote_db_name`;\nUSE `remote_db_name`;\nCREATE TABLE `wp_options` (id INT);");
  const envService = makeFakeEnvService();
  const migration = new WordPressMigrationService(envService);
  await migration.importAndReplace(directory, { projectName: "demo", profile: {} }, null);
  const normalized = await fs.readFile(path.join(directory, "staging.sql"), "utf8");
  assert.doesNotMatch(normalized, /CREATE DATABASE/);
  assert.match(normalized, /CREATE TABLE `wp_options`/);
  await fs.remove(directory);
});

test("respects profile.database.normalizeCollations: false", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-migration-collation-"));
  await fs.writeFile(path.join(directory, "staging.sql"), "CREATE TABLE t (c VARCHAR(10)) COLLATE=utf8mb4_uca1400_ai_ci;");
  const envService = makeFakeEnvService();
  const migration = new WordPressMigrationService(envService);
  await migration.importAndReplace(directory, { projectName: "demo", profile: { database: { normalizeCollations: false } } }, null);
  const normalized = await fs.readFile(path.join(directory, "staging.sql"), "utf8");
  assert.match(normalized, /uca1400/, "collation should survive when normalizeCollations is false");
  await fs.remove(directory);
});
