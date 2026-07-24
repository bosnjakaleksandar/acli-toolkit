import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSqlDump, NORMALIZATION_STEPS } from "../src/services/SqlNormalizationService.ts";

test("strips the MariaDB sandbox-mode marker", () => {
  const input = Buffer.from("/*M!999999\\- enable the sandbox mode */;\nCREATE TABLE wp_posts (id INT);\n");
  const result = normalizeSqlDump(input).toString("utf8");
  assert.doesNotMatch(result, /sandbox mode/);
  assert.match(result, /CREATE TABLE wp_posts/);
});

test("removes CREATE DATABASE and USE statements so the dump targets the local database regardless of the remote name", () => {
  const input = Buffer.from([
    "CREATE DATABASE /*!32312 IF NOT EXISTS*/ `staging_client_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;",
    "USE `staging_client_db`;",
    "CREATE TABLE `wp_options` (id INT);",
    "INSERT INTO `wp_options` VALUES (1);",
  ].join("\n"));
  const result = normalizeSqlDump(input).toString("utf8");
  assert.doesNotMatch(result, /CREATE DATABASE/);
  assert.doesNotMatch(result, /USE `staging_client_db`/);
  assert.match(result, /CREATE TABLE `wp_options`/);
  assert.match(result, /INSERT INTO `wp_options`/);
});

test("rewrites MariaDB uca1400 collations to broadly compatible equivalents", () => {
  const input = Buffer.from("CREATE TABLE t (c VARCHAR(10)) COLLATE=utf8mb4_uca1400_ai_ci;\nCREATE TABLE u (c VARCHAR(10)) COLLATE=utf8mb3_uca1400_ai_ci;\n");
  const result = normalizeSqlDump(input).toString("utf8");
  assert.match(result, /COLLATE=utf8mb4_unicode_520_ci/);
  assert.match(result, /COLLATE=utf8_general_ci/);
  assert.doesNotMatch(result, /uca1400/);
});

test("collapses remaining utf8mb3_ collations to utf8_", () => {
  const input = Buffer.from("COLLATE=utf8mb3_general_ci");
  const result = normalizeSqlDump(input).toString("utf8");
  assert.equal(result, "COLLATE=utf8_general_ci");
});

test("is binary-safe: byte content outside the targeted patterns survives untouched", () => {
  const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x0a, 0x00]);
  const input = Buffer.concat([Buffer.from("CREATE TABLE t (id INT);\n"), binary]);
  const result = normalizeSqlDump(input);
  assert.ok(result.includes(binary));
});

test("reports progress through the spinner for every step", () => {
  const messages = [];
  const spinner = { message: (text) => messages.push(text) };
  normalizeSqlDump(Buffer.from("SELECT 1;"), { spinner });
  assert.equal(messages.length, NORMALIZATION_STEPS.length);
  for (const step of NORMALIZATION_STEPS) assert.ok(messages.some((message) => message.includes(step.name)));
});

test("normalizeCollations: false skips the collation step but still applies the others", () => {
  const input = Buffer.from([
    "CREATE DATABASE `staging_db`;",
    "CREATE TABLE t (c VARCHAR(10)) COLLATE=utf8mb4_uca1400_ai_ci;",
  ].join("\n"));
  const result = normalizeSqlDump(input, { normalizeCollations: false }).toString("utf8");
  assert.doesNotMatch(result, /CREATE DATABASE/);
  assert.match(result, /uca1400/, "collation should be left untouched when normalizeCollations is false");
});

test("normalizeCollations: false only skips one step's spinner message, not all of them", () => {
  const messages = [];
  const spinner = { message: (text) => messages.push(text) };
  normalizeSqlDump(Buffer.from("SELECT 1;"), { spinner, normalizeCollations: false });
  assert.equal(messages.length, NORMALIZATION_STEPS.length - 1);
  assert.ok(!messages.some((message) => message.includes("normalize-collations")));
});
