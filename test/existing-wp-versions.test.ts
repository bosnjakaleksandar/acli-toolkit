import test from "node:test";
import assert from "node:assert/strict";
import { askExistingWpVersions } from "../src/projects/prompts/wordpressPrompts.ts";
import type { ProjectPlan } from "../src/core/model/ProjectPlan.ts";

/**
 * Ported from the deleted test/existing-wp-strategy.test.js. The MySQL/WP
 * version resolution it covered used to live in ExistingWPStrategy.
 * askQuestions; `acli create` now delegates existing-WordPress setup to
 * `acli import` and resolves these versions up front instead, because
 * "Customize advanced settings?" is asked by create and never by import.
 *
 * None of these tests may invoke a real prompt: this suite runs without a
 * TTY, so a test that reached @clack/prompts would hang or reject rather
 * than pass. Passing is itself the assertion that no prompt was reached.
 */

test("uses defaults without prompting when customizeAdvanced is false, even interactively", async () => {
  const ctx: ProjectPlan = { projectName: "demo", environment: "docker", customizeAdvanced: false };
  const result = await askExistingWpVersions(ctx, { nonInteractive: false });
  assert.equal(result.mysqlVersion, "8.0");
  assert.equal(result.wpVersion, "latest");
});

test("honors a preset-supplied version even when customizeAdvanced is false", async () => {
  const ctx: ProjectPlan = { projectName: "demo", environment: "docker", customizeAdvanced: false, mysqlVersion: "5.7" };
  const result = await askExistingWpVersions(ctx, { nonInteractive: false });
  assert.equal(result.mysqlVersion, "5.7");
});

test("honors preset-supplied versions when non-interactive, and never prompts", async () => {
  const ctx: ProjectPlan = { projectName: "demo", environment: "docker", customizeAdvanced: true, mysqlVersion: "mariadb:11.4", wpVersion: "6.9.4" };
  const result = await askExistingWpVersions(ctx, { nonInteractive: true });
  assert.equal(result.mysqlVersion, "mariadb:11.4");
  assert.equal(result.wpVersion, "6.9.4");
});

test("lando always resolves wpVersion to latest — its recipe pins WordPress, so the version is never asked for", async () => {
  const ctx: ProjectPlan = { projectName: "demo", environment: "lando", customizeAdvanced: true, wpVersion: "6.9.4" };
  const result = await askExistingWpVersions(ctx, { nonInteractive: true });
  assert.equal(result.wpVersion, "latest");
});
