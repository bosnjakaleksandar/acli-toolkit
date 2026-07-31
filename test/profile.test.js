import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { deleteProfile, saveProfile, setProfileGitSshHostAlias } from "../src/profiles/ProfileStore.ts";
import { readConfigFile } from "../src/config/ConfigLoader.ts";

const profile = {
  type: "wordpress",
  ssh: { host: "staging.example.com", port: 22, username: "{projectName}", hostKeyPolicy: "strict" },
  remote: { projectRoot: "/srv/{projectName}", wordpressRoot: "wordpress" },
  files: { transport: "rsync", directories: ["uploads", "themes"] },
  database: { driver: "wp-cli" },
  git: { enabled: true },
  urls: { staging: "https://{projectName}.example.com" },
};

test("profiles can be created, replaced, and deleted in an explicit config", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-"));
  const configPath = path.join(directory, "config.yaml");
  await saveProfile("agency", profile, { configPath });
  assert.deepEqual((await readConfigFile(configPath)).profiles.agency, profile);
  await assert.rejects(saveProfile("agency", profile, { configPath }), /already exists/);
  await saveProfile("agency", { ...profile, ssh: { ...profile.ssh, host: "new.example.com" } }, { configPath, force: true });
  assert.equal((await readConfigFile(configPath)).profiles.agency.ssh.host, "new.example.com");
  await deleteProfile("agency", { configPath });
  assert.equal((await readConfigFile(configPath)).profiles.agency, undefined);
});

test("profile names are restricted to portable identifiers", async () => {
  await assert.rejects(saveProfile("Bad Profile", profile, { configPath: path.join(os.tmpdir(), "unused-acli.yaml") }), /Profile name/);
});

test("a local Git SSH alias can be set and cleared without replacing the rest of the profile", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-git-alias-"));
  const configPath = path.join(directory, "config.yaml");
  await saveProfile("agency", profile, { configPath });
  await setProfileGitSshHostAlias("agency", "github-work", { configPath });
  let saved = await readConfigFile(configPath);
  assert.equal(saved.profiles.agency.git.sshHostAlias, "github-work");
  assert.equal(saved.profiles.agency.ssh.host, profile.ssh.host);
  await assert.rejects(setProfileGitSshHostAlias("agency", "-oProxyCommand=bad", { configPath }), /host alias/i);
  await setProfileGitSshHostAlias("agency", null, { configPath });
  saved = await readConfigFile(configPath);
  assert.equal(saved.profiles.agency.git.sshHostAlias, undefined);
});
