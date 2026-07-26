import test from "node:test";
import assert from "node:assert/strict";
import ExistingWPStrategy from "../src/projects/strategies/ExistingWPStrategy.ts";

function makeCtx({ profile: profileOverrides, ...overrides } = {}) {
  return {
    projectName: "demo",
    environment: "lando",
    mysqlVersion: "8.0",
    profile: {
      profileName: "shared-host",
      ssh: { host: "example.com", username: "deploy" },
      remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
      files: { transport: "rsync" },
      database: { driver: "wp-cli" },
      ...profileOverrides,
    },
    ...overrides,
  };
}

test("askQuestions no longer requires a staging URL when the profile doesn't declare one", async () => {
  const strategy = new ExistingWPStrategy({ getLocalUrl: () => "https://demo.lndo.site" });
  const result = await strategy.askQuestions(makeCtx(), { nonInteractive: true });
  assert.equal(result.stagingUrl, null);
  assert.equal(result.profile.ssh.host, "example.com");
});

test("askQuestions still uses a declared staging URL as a fallback source when present", async () => {
  const strategy = new ExistingWPStrategy({ getLocalUrl: () => "https://demo.lndo.site" });
  const ctx = makeCtx({ profile: { urls: { staging: "https://demo.staging.example.com" } } });
  const result = await strategy.askQuestions(ctx, { nonInteractive: true });
  assert.equal(result.stagingUrl, "https://demo.staging.example.com");
});

test("askQuestions prefers an explicit --staging-url over the profile default", async () => {
  const strategy = new ExistingWPStrategy({ getLocalUrl: () => "https://demo.lndo.site" });
  const ctx = makeCtx({ stagingUrl: "https://override.example.com", profile: { urls: { staging: "https://demo.staging.example.com" } } });
  const result = await strategy.askQuestions(ctx, { nonInteractive: true });
  assert.equal(result.stagingUrl, "https://override.example.com");
});

test("askQuestions uses defaults without prompting when customizeAdvanced is false (interactive) — the 'Customize advanced settings?' answer now actually matters", async () => {
  // Previously this strategy always asked the MySQL/WP version questions
  // regardless of customizeAdvanced, so declining "Customize advanced
  // settings?" had no effect. If this test actually invoked a real prompt
  // (rather than resolving from the default), it would hang/reject in this
  // non-TTY test run — passing proves no prompt was invoked.
  const strategy = new ExistingWPStrategy({ getLocalUrl: () => "https://demo.lndo.site" });
  const ctx = { projectName: "demo", environment: "docker", customizeAdvanced: false, profile: makeCtx().profile };
  const result = await strategy.askQuestions(ctx, { nonInteractive: false });
  assert.equal(result.mysqlVersion, "8.0");
  assert.equal(result.wpVersion, "latest");
});

test("askQuestions still honors a preset-supplied version even when customizeAdvanced is false", async () => {
  const strategy = new ExistingWPStrategy({ getLocalUrl: () => "https://demo.lndo.site" });
  const ctx = { projectName: "demo", environment: "docker", customizeAdvanced: false, mysqlVersion: "5.7", profile: makeCtx().profile };
  const result = await strategy.askQuestions(ctx, { nonInteractive: false });
  assert.equal(result.mysqlVersion, "5.7");
});
