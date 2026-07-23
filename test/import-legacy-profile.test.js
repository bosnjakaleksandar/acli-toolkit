import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { importLegacyProfileCommand } from "../src/commands/profile.js";
import { validateProfileConfig } from "../src/services/ConfigService.ts";

async function withEnv(overrides, run) {
  const original = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    await run();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("reproduces the legacy SSH convention: username = project name, remote path <project>/wordpress", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-legacy-"));
  await withEnv({ STAGING_SSH_HOST: undefined, STAGING_SUFFIX: undefined }, async () => {
    const { profile } = await importLegacyProfileCommand("legacy", { host: "popart.cloud", yes: true, config: path.join(directory, "config.yaml") });
    assert.equal(profile.ssh.host, "popart.cloud");
    assert.equal(profile.ssh.username, "{projectName}");
    assert.equal(profile.remote.projectRoot, "{projectName}");
    assert.equal(profile.remote.wordpressRoot, "wordpress");
    assert.deepEqual(validateProfileConfig(profile), profile);
  });
  await fs.remove(directory);
});

test("reads STAGING_SSH_HOST and STAGING_SUFFIX from the environment when --host/--suffix are not passed", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-legacy-"));
  await withEnv({ STAGING_SSH_HOST: "env-host.example.com", STAGING_SUFFIX: ".env-suffix" }, async () => {
    const { profile } = await importLegacyProfileCommand("legacy", { yes: true, config: path.join(directory, "config.yaml") });
    assert.equal(profile.ssh.host, "env-host.example.com");
    assert.equal(profile.urls.staging, "https://{projectName}.env-suffix");
  });
  await fs.remove(directory);
});

test("defaults the staging URL suffix to .staging when STAGING_SUFFIX is not set", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-legacy-"));
  await withEnv({ STAGING_SSH_HOST: undefined, STAGING_SUFFIX: undefined }, async () => {
    const { profile } = await importLegacyProfileCommand("legacy", { host: "h.example.com", yes: true, config: path.join(directory, "config.yaml") });
    assert.equal(profile.urls.staging, "https://{projectName}.staging");
    assert.deepEqual(profile.urls.additionalSearchReplace, ["http://{projectName}.staging"]);
  });
  await fs.remove(directory);
});

test("discovers the remote database via Docker container name, matching the legacy tool's discovery script", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-legacy-"));
  const { profile } = await importLegacyProfileCommand("legacy", { host: "h.example.com", yes: true, config: path.join(directory, "config.yaml") });
  assert.equal(profile.database.driver, "docker");
  assert.equal(profile.database.discovery, "container-name");
  assert.equal(profile.database.containerPattern, "{projectName}");
  await fs.remove(directory);
});

test("throws a clear error when no host is available from any source", async () => {
  await withEnv({ STAGING_SSH_HOST: undefined }, async () => {
    await assert.rejects(
      () => importLegacyProfileCommand("legacy", { yes: true, config: "/tmp/unused-acli-import-legacy.yaml" }),
      /STAGING_SSH_HOST is required/,
    );
  });
});

test("--host overrides STAGING_SSH_HOST when both are present", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-legacy-"));
  await withEnv({ STAGING_SSH_HOST: "env-host.example.com" }, async () => {
    const { profile } = await importLegacyProfileCommand("legacy", { host: "explicit-host.example.com", yes: true, config: path.join(directory, "config.yaml") });
    assert.equal(profile.ssh.host, "explicit-host.example.com");
  });
  await fs.remove(directory);
});
