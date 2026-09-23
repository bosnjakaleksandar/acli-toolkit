import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSqlDumpFile, NORMALIZATION_STEPS } from "../src/wordpress/migration/sqlNormalization.ts";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

/** Runs the same streaming file normalization the import pipeline uses. */
async function normalize(input, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-normalize-"));
  const filePath = path.join(directory, "staging.sql");
  try {
    await fs.writeFile(filePath, input);
    await normalizeSqlDumpFile(filePath, options);
    return await fs.readFile(filePath);
  } finally {
    await fs.remove(directory);
  }
}

test("strips the MariaDB sandbox-mode marker", async () => {
  const result = (await normalize("/*M!999999\\- enable the sandbox mode */;\nCREATE TABLE wp_posts (id INT);\n")).toString("utf8");
  assert.doesNotMatch(result, /sandbox mode/);
  assert.match(result, /CREATE TABLE wp_posts/);
});

test("removes CREATE DATABASE and USE statements so the dump targets the local database regardless of the remote name", async () => {
  const result = (await normalize([
    "CREATE DATABASE /*!32312 IF NOT EXISTS*/ `staging_client_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;",
    "USE `staging_client_db`;",
    "CREATE TABLE `wp_options` (id INT);",
    "INSERT INTO `wp_options` VALUES (1);",
  ].join("\n"))).toString("utf8");
  assert.doesNotMatch(result, /CREATE DATABASE/);
  assert.doesNotMatch(result, /USE `staging_client_db`/);
  assert.match(result, /CREATE TABLE `wp_options`/);
  assert.match(result, /INSERT INTO `wp_options`/);
});

test("rewrites MariaDB uca1400 collations to broadly compatible equivalents", async () => {
  const result = (await normalize("CREATE TABLE t (c VARCHAR(10)) COLLATE=utf8mb4_uca1400_ai_ci;\nCREATE TABLE u (c VARCHAR(10)) COLLATE=utf8mb3_uca1400_ai_ci;\n")).toString("utf8");
  assert.match(result, /COLLATE=utf8mb4_unicode_520_ci/);
  assert.match(result, /COLLATE=utf8_general_ci/);
  assert.doesNotMatch(result, /uca1400/);
});

test("collapses remaining utf8mb3_ collations to utf8_", async () => {
  assert.equal((await normalize("COLLATE=utf8mb3_general_ci")).toString("utf8"), "COLLATE=utf8_general_ci");
});

test("is binary-safe: byte content outside the targeted patterns survives untouched", async () => {
  const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x0a, 0x00]);
  const result = await normalize(Buffer.concat([Buffer.from("CREATE TABLE t (id INT);\n"), binary]));
  assert.ok(result.includes(binary));
});

test("reports progress through the spinner for every step", async () => {
  const messages = [];
  await normalize("SELECT 1;", { spinner: { message: (text) => messages.push(text) } });
  assert.equal(messages.length, NORMALIZATION_STEPS.length);
  for (const step of NORMALIZATION_STEPS) assert.ok(messages.some((message) => message.includes(step.name)));
});

test("normalizeCollations: false skips the collation step but still applies the others", async () => {
  const result = (await normalize([
    "CREATE DATABASE `staging_db`;",
    "CREATE TABLE t (c VARCHAR(10)) COLLATE=utf8mb4_uca1400_ai_ci;",
  ].join("\n"), { normalizeCollations: false })).toString("utf8");
  assert.doesNotMatch(result, /CREATE DATABASE/);
  assert.match(result, /uca1400/, "collation should be left untouched when normalizeCollations is false");
});

test("normalizeCollations: false only skips one step's spinner message, not all of them", async () => {
  const messages = [];
  await normalize("SELECT 1;", { spinner: { message: (text) => messages.push(text) }, normalizeCollations: false });
  assert.equal(messages.length, NORMALIZATION_STEPS.length - 1);
  assert.ok(!messages.some((message) => message.includes("normalize-collations")));
});

test("file normalization streams replacements and preserves long INSERT lines", async () => {
  const longInsert = `INSERT INTO wp_posts VALUES ('${"x".repeat(200_000)}');`;
  const result = (await normalize(`/*M!999999\\- enable the sandbox mode */\nCREATE DATABASE \`remote\`;\nUSE \`remote\`;\n${longInsert}\nCREATE TABLE t (c TEXT) COLLATE=utf8mb4_uca1400_ai_ci;\n`)).toString("utf8");
  assert.doesNotMatch(result, /sandbox mode|CREATE DATABASE|^USE /m);
  assert.match(result, /utf8mb4_unicode_520_ci/);
  assert.ok(result.includes(longInsert));
});
