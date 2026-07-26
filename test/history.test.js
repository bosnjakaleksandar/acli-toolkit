import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { loadLastPlan, saveSuccessfulPlan, savePlanAsPreset } from "../src/projects/plan/history.ts";
import { loadPreset } from "../src/projects/plan/presets.ts";
import { loadProfile } from "../src/profiles/loadProfile.ts";
import { loadConfig } from "../src/config/ConfigLoader.ts";

test("history stores reusable fields and excludes secrets", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-history-"));
  await saveSuccessfulPlan({ projectName: "app", framework: "react", environment: "docker", dbPassword: "secret", profile: { ssh: { identityFile: "/secret" } } }, { cwd });
  const plan = await loadLastPlan({ cwd });
  assert.deepEqual(plan, { projectName: "app", framework: "react", environment: "docker" });
  const raw = await fs.readFile(path.join(cwd, ".acli", "history.json"), "utf8");
  assert.doesNotMatch(raw, /secret/);
  await fs.remove(cwd);
});

test("history keeps the profile name (not the resolved object) when a profile is attached", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-history-"));
  const resolvedProfile = { profileName: "shared-host", ssh: { host: "example.com", identityFile: "/secret/key" } };
  await saveSuccessfulPlan({ projectName: "app", setupType: "existing-wp", environment: "docker", stagingUrl: "https://app.staging", profile: resolvedProfile }, { cwd });
  const plan = await loadLastPlan({ cwd });
  assert.equal(plan.profile, "shared-host");
  assert.equal(plan.stagingUrl, "https://app.staging");
  const raw = await fs.readFile(path.join(cwd, ".acli", "history.json"), "utf8");
  assert.doesNotMatch(raw, /example\.com|secret/);
  await fs.remove(cwd);
});

test("an existing-wp plan saved as a preset round-trips into a runnable preset with its profile reference intact", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-history-preset-"));
  const resolvedProfile = { profileName: "shared-host", ssh: { host: "example.com", identityFile: "/secret/key" } };
  const ctx = {
    projectName: "client-site",
    setupType: "existing-wp",
    appType: "wordpress",
    projectType: "wp-existing",
    environment: "docker",
    mysqlVersion: "8.0",
    stagingUrl: "https://client-site.staging",
    profile: resolvedProfile,
  };
  const configPath = await savePlanAsPreset("client-site-recipe", ctx, { cwd });
  assert.equal(configPath, path.join(cwd, ".acli", "config.yaml"));

  const { config } = await loadConfig({ cwd, configPath });
  const preset = await loadPreset("client-site-recipe", config, cwd);
  assert.equal(preset.profile, "shared-host");
  assert.equal(preset.setupType, "existing-wp");
  assert.equal(preset.stagingUrl, "https://client-site.staging");
  assert.equal(preset.projectName, undefined, "projectName must not leak into a reusable preset");

  // The preset only carries the profile *reference*; resolving the actual
  // connection details still requires that named profile to exist in config.
  await assert.rejects(() => loadProfile(preset.profile, config, cwd), /shared-host.*not found/is);

  const raw = await fs.readFile(configPath, "utf8");
  assert.doesNotMatch(raw, /example\.com|secret/);
  await fs.remove(cwd);
});
