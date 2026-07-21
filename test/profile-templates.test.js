import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { getProfileTemplate, listProfileTemplates, PROFILE_TEMPLATES } from "../src/config/profileTemplates.js";
import { createProfileCommand } from "../src/commands/profile.js";
import { readConfigFile, validateProfileConfig } from "../src/services/ConfigService.js";

test("listProfileTemplates exposes name, label, and description for every built-in template", () => {
  const templates = listProfileTemplates();
  assert.equal(templates.length, Object.keys(PROFILE_TEMPLATES).length);
  for (const template of templates) {
    assert.ok(template.name);
    assert.ok(template.label);
    assert.ok(template.description);
  }
});

test("getProfileTemplate returns null for an unknown name", () => {
  assert.equal(getProfileTemplate("not-a-template"), null);
});

for (const name of Object.keys(PROFILE_TEMPLATES)) {
  test(`--template ${name} produces a profile that passes validateProfileConfig once required fields are supplied`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-template-"));
    const configPath = path.join(directory, "config.yaml");
    const requiresDbSecrets = name === "direct-database";
    const options = {
      template: name,
      yes: true,
      config: configPath,
      host: "concrete-host.example.com",
      ...(requiresDbSecrets ? { dbUser: "${STAGING_DB_USER}", dbPassword: "${STAGING_DB_PASSWORD}", dbName: "${STAGING_DB_NAME}" } : {}),
    };
    const { profile, filePath } = await createProfileCommand("demo", options);
    assert.equal(filePath, configPath);
    assert.deepEqual(validateProfileConfig(profile), profile);
    assert.equal(profile.ssh.host, "concrete-host.example.com");

    const saved = await readConfigFile(configPath);
    assert.deepEqual(saved.profiles.demo, profile);
  });
}

test("shared-host template defaults to the wp-cli driver, rsync transport, and Git discovery enabled", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-template-"));
  const { profile } = await createProfileCommand("demo", { template: "shared-host", yes: true, config: path.join(directory, "config.yaml"), host: "h.example.com" });
  assert.equal(profile.database.driver, "wp-cli");
  assert.equal(profile.files.transport, "rsync");
  assert.equal(profile.git.enabled, true);
});

test("docker-staging template defaults to the docker driver with a db service and Git discovery disabled", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-template-"));
  const { profile } = await createProfileCommand("demo", { template: "docker-staging", yes: true, config: path.join(directory, "config.yaml"), host: "h.example.com" });
  assert.equal(profile.database.driver, "docker");
  assert.equal(profile.database.service, "db");
  assert.equal(profile.git.enabled, false);
});

test("an explicit CLI flag overrides the template's default for that field", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-template-"));
  const { profile } = await createProfileCommand("demo", { template: "shared-host", yes: true, config: path.join(directory, "config.yaml"), host: "h.example.com", transport: "sftp" });
  assert.equal(profile.files.transport, "sftp");
});

test("an unknown --template name throws a clear error listing the available templates", async () => {
  await assert.rejects(
    createProfileCommand("demo", { template: "bogus-template", yes: true, config: "/tmp/unused.yaml", host: "h.example.com" }),
    /Unknown profile template "bogus-template".*shared-host/s,
  );
});
