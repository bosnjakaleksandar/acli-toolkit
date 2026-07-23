import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import DatabaseDumpService from "../src/services/DatabaseDumpService.js";
import { CliError } from "../src/core/errors.ts";

async function withDump(sql, run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-dump-"));
  if (sql !== null) await fs.writeFile(path.join(directory, "staging.sql"), sql);
  try {
    await run(directory);
  } finally {
    await fs.remove(directory);
  }
}

test("detects the default wp_ prefix from a postmeta table", async () => {
  await withDump("CREATE TABLE `wp_postmeta` (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_");
  });
});

test("detects a non-default prefix even when postmeta is not the first indicator table found", async () => {
  await withDump("CREATE TABLE `wp_client7_options` (id INT);\nCREATE TABLE `wp_client7_postmeta` (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_client7_");
  });
});

test("remote facts win over a mismatched dump-detected prefix", async () => {
  await withDump("CREATE TABLE `wp_postmeta` (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir, null, { tablePrefix: "wp_actual_" });
    assert.equal(prefix, "wp_actual_");
  });
});

test("falls back to the dump-detected prefix when no remote facts are available", async () => {
  await withDump("CREATE TABLE `custom_posts` (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir, null, null);
    assert.equal(prefix, "custom_");
  });
});

test("fails loudly instead of silently defaulting to wp_ when no prefix is detectable", async () => {
  await withDump("SELECT 1;", async (dir) => {
    await assert.rejects(
      () => new DatabaseDumpService().detectTablePrefix(dir),
      (error) => {
        assert.ok(error instanceof CliError);
        assert.equal(error.code, "TABLE_PREFIX_NOT_DETECTED");
        return true;
      },
    );
  });
});

test("fails loudly when the dump is missing and no remote facts are available", async () => {
  await withDump(null, async (dir) => {
    await assert.rejects(() => new DatabaseDumpService().detectTablePrefix(dir), (error) => {
      assert.equal(error.code, "TABLE_PREFIX_NOT_DETECTED");
      return true;
    });
  });
});

test("uses remote facts even when the local dump read fails", async () => {
  await withDump(null, async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir, null, { tablePrefix: "wp_remote_" });
    assert.equal(prefix, "wp_remote_");
  });
});

test("regression: a plugin table alphabetically ahead of the real options table does not win (e.g. GDPR Cookie Consent's wp_gdpr_cc_options)", async () => {
  // Reproduces a real production failure: mysqldump lists CREATE TABLE
  // statements alphabetically, so a plugin table like `wp_gdpr_cc_options`
  // appears before the genuine `wp_options` — the old "first options match
  // wins" logic detected `wp_gdpr_cc_` as the site's table prefix and wrote
  // it into docker-compose.yaml, breaking the import even though the
  // connection itself was fine.
  const dump = [
    "CREATE TABLE `wp_commentmeta` (id INT);",
    "CREATE TABLE `wp_comments` (id INT);",
    "CREATE TABLE `wp_gdpr_cc_options` (id INT);",
    "CREATE TABLE `wp_itsec_lockouts` (id INT);",
    "CREATE TABLE `wp_itsec_logs` (id INT);",
    "CREATE TABLE `wp_links` (id INT);",
    "CREATE TABLE `wp_options` (id INT);",
    "CREATE TABLE `wp_postmeta` (id INT);",
    "CREATE TABLE `wp_posts` (id INT);",
    "CREATE TABLE `wp_term_relationships` (id INT);",
    "CREATE TABLE `wp_term_taxonomy` (id INT);",
    "CREATE TABLE `wp_termmeta` (id INT);",
    "CREATE TABLE `wp_terms` (id INT);",
    "CREATE TABLE `wp_usermeta` (id INT);",
    "CREATE TABLE `wp_users` (id INT);",
  ].join("\n");
  await withDump(dump, async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_");
  });
});

test("regression: a multisite secondary site's tables do not outrank the primary site's prefix", async () => {
  const dump = [
    "CREATE TABLE `wp_commentmeta` (id INT);",
    "CREATE TABLE `wp_comments` (id INT);",
    "CREATE TABLE `wp_links` (id INT);",
    "CREATE TABLE `wp_options` (id INT);",
    "CREATE TABLE `wp_postmeta` (id INT);",
    "CREATE TABLE `wp_posts` (id INT);",
    "CREATE TABLE `wp_usermeta` (id INT);",
    "CREATE TABLE `wp_users` (id INT);",
    "CREATE TABLE `wp_2_comments` (id INT);",
    "CREATE TABLE `wp_2_options` (id INT);",
    "CREATE TABLE `wp_2_postmeta` (id INT);",
    "CREATE TABLE `wp_2_posts` (id INT);",
  ].join("\n");
  await withDump(dump, async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_", "the primary site's prefix (more core tables: users/usermeta) must win over a secondary site's");
  });
});

test("detects a short custom prefix (e.g. x_) when it covers enough core tables", async () => {
  const dump = [
    "CREATE TABLE `x_options` (id INT);",
    "CREATE TABLE `x_posts` (id INT);",
    "CREATE TABLE `x_postmeta` (id INT);",
  ].join("\n");
  await withDump(dump, async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "x_");
  });
});

test("detects the prefix from backtick-less and ANSI double-quoted CREATE TABLE statements", async () => {
  await withDump("CREATE TABLE wp_options (id INT);\nCREATE TABLE \"wp_posts\" (id INT);\nCREATE TABLE wp_postmeta (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_");
  });
});

test("preserves the original case of an uppercase prefix", async () => {
  await withDump("CREATE TABLE `WP_OPTIONS` (id INT);\nCREATE TABLE `WP_POSTS` (id INT);\nCREATE TABLE `WP_POSTMETA` (id INT);", async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "WP_");
  });
});

test("regression: a column name ending in a core suffix (e.g. `display_options`) is never mistaken for a table name", async () => {
  const dump = [
    "CREATE TABLE `wp_foo` (`display_options` text);",
    "CREATE TABLE `wp_options` (id INT);",
    "CREATE TABLE `wp_posts` (id INT);",
    "CREATE TABLE `wp_postmeta` (id INT);",
  ].join("\n");
  await withDump(dump, async (dir) => {
    const prefix = await new DatabaseDumpService().detectTablePrefix(dir);
    assert.equal(prefix, "wp_");
  });
});
