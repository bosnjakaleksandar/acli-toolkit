import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { saveProfile } from "../src/services/ProfileService.ts";
import {
  describeProfile,
  exportProfile,
  getCurrentProfile,
  inspectProfile,
  listProfiles,
  readImportableProfile,
  validateNamedProfile,
} from "../src/services/ProfileQueryService.ts";

/**
 * Coverage for the business logic extracted out of commands/profile.ts's
 * inline action handlers (phase 3.3) — this surface previously had no
 * direct test coverage at all, so this both proves the extraction preserved
 * behavior and gives future changes here something to run against.
 */

const wpProfile = (host: string) => ({
  type: "wordpress" as const,
  ssh: { host, username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { transport: "rsync" as const },
  database: { driver: "wp-cli" as const },
});

async function withConfig(run: (configPath: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-profile-query-"));
  const configPath = path.join(dir, "config.yaml");
  try {
    await run(configPath);
  } finally {
    await fs.remove(dir);
  }
}

test("listProfiles returns every profile sorted by name, marking the default", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("zeta", wpProfile("z.example.com") as any, { configPath });
    await saveProfile("alpha", wpProfile("a.example.com") as any, { configPath });
    const raw = YAML.parse(await fs.readFile(configPath, "utf8"));
    raw.defaults = { profile: "alpha" };
    await fs.writeFile(configPath, YAML.stringify(raw));

    const rows = await listProfiles({ config: configPath });
    assert.deepEqual(rows.map((r) => r.name), ["alpha", "zeta"]);
    assert.equal(rows.find((r) => r.name === "alpha")!.default, true);
    assert.equal(rows.find((r) => r.name === "zeta")!.default, false);
  });
});

test("listProfiles returns an empty array when the config has no profiles", async () => {
  await withConfig(async (configPath) => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, YAML.stringify({ version: 1 }));
    assert.deepEqual(await listProfiles({ config: configPath }), []);
  });
});

test("getCurrentProfile reports no default when none is set", async () => {
  await withConfig(async (configPath) => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, YAML.stringify({ version: 1 }));
    const result = await getCurrentProfile({ config: configPath });
    assert.deepEqual(result, { name: null, missing: false, description: null });
  });
});

test("getCurrentProfile reports the default profile's description when it exists", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("agency", wpProfile("agency.example.com") as any, { configPath });
    const raw = YAML.parse(await fs.readFile(configPath, "utf8"));
    raw.defaults = { profile: "agency" };
    await fs.writeFile(configPath, YAML.stringify(raw));

    const result = await getCurrentProfile({ config: configPath });
    assert.equal(result.name, "agency");
    assert.equal(result.missing, false);
    assert.match(result.description!, /agency\.example\.com/);
  });
});

test("getCurrentProfile flags a default that names a profile which no longer exists", async () => {
  await withConfig(async (configPath) => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, YAML.stringify({ version: 1, defaults: { profile: "ghost" } }));
    const result = await getCurrentProfile({ config: configPath });
    assert.equal(result.name, "ghost");
    assert.equal(result.missing, true);
    assert.equal(result.description, null);
  });
});

test("inspectProfile returns a redacted copy of the named profile and throws for an unknown name", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("agency", { ...wpProfile("agency.example.com"), ssh: { host: "agency.example.com", username: "deploy", identityFile: "/home/me/.ssh/id_ed25519" } } as any, { configPath });
    const inspected = await inspectProfile("agency", { config: configPath }) as any;
    assert.equal(inspected.ssh.identityFile, "[REDACTED]");
    assert.equal(inspected.ssh.host, "agency.example.com");
    await assert.rejects(() => inspectProfile("missing", { config: configPath }), /was not found/);
  });
});

test("validateNamedProfile resolves for a valid profile and throws for an unknown name", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("agency", wpProfile("agency.example.com") as any, { configPath });
    await validateNamedProfile("agency", { config: configPath });
    await assert.rejects(() => validateNamedProfile("missing", { config: configPath }), /was not found/);
  });
});

test("exportProfile serializes the profile as YAML and flags literal secret fields", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("agency", { ...wpProfile("agency.example.com"), ssh: { host: "agency.example.com", username: "deploy", identityFile: "/home/me/.ssh/id_ed25519" } } as any, { configPath });
    const result = await exportProfile("agency", { config: configPath });
    assert.match(result.yaml, /agency\.example\.com/);
    assert.deepEqual(result.literalSecretPaths, ["ssh.identityFile"]);
  });
});

test("exportProfile reports no literal secret fields for a profile using only ${ENV_VAR} references", async () => {
  await withConfig(async (configPath) => {
    await saveProfile("agency", { ...wpProfile("agency.example.com"), ssh: { host: "agency.example.com", username: "deploy", identityFile: "${SSH_KEY_PATH}" } } as any, { configPath });
    const result = await exportProfile("agency", { config: configPath });
    assert.deepEqual(result.literalSecretPaths, []);
  });
});

test("readImportableProfile resolves a profile:-wrapped document", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-profile-"));
  const filePath = path.join(dir, "shared.yaml");
  await fs.writeFile(filePath, YAML.stringify({ profile: wpProfile("shared.example.com") }));
  const result = await readImportableProfile(filePath, "custom-name");
  assert.equal(result.name, "custom-name");
  assert.equal((result.profile as any).ssh.host, "shared.example.com");
  await fs.remove(dir);
});

test("readImportableProfile resolves a single-entry profiles: map without requiring a name", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-profile-"));
  const filePath = path.join(dir, "config.yaml");
  await fs.writeFile(filePath, YAML.stringify({ version: 1, profiles: { onlyone: wpProfile("only.example.com") } }));
  const result = await readImportableProfile(filePath);
  assert.equal(result.name, "onlyone");
  await fs.remove(dir);
});

test("readImportableProfile requires an explicit name when profiles: has more than one entry", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-profile-"));
  const filePath = path.join(dir, "config.yaml");
  await fs.writeFile(filePath, YAML.stringify({ version: 1, profiles: { a: wpProfile("a.example.com"), b: wpProfile("b.example.com") } }));
  await assert.rejects(() => readImportableProfile(filePath), /contains multiple profiles/);
  const result = await readImportableProfile(filePath, "b");
  assert.equal((result.profile as any).ssh.host, "b.example.com");
  await fs.remove(dir);
});

test("readImportableProfile falls back to treating the whole document as the profile, and derives a name from the filename", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-profile-"));
  const filePath = path.join(dir, "bare-profile.yaml");
  await fs.writeFile(filePath, YAML.stringify(wpProfile("bare.example.com")));
  const result = await readImportableProfile(filePath);
  assert.equal(result.name, "bare-profile");
  await fs.remove(dir);
});

test("readImportableProfile throws a clear error for a missing file", async () => {
  await assert.rejects(() => readImportableProfile("/tmp/does-not-exist-acli.yaml"), /File not found/);
});

test("readImportableProfile rejects an invalid profile before returning it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-profile-"));
  const filePath = path.join(dir, "invalid.yaml");
  await fs.writeFile(filePath, YAML.stringify({ profile: { type: "wordpress" } }));
  await assert.rejects(() => readImportableProfile(filePath), /ssh\.host is required/);
  await fs.remove(dir);
});

test("describeProfile summarizes host, database driver, and file transport", () => {
  assert.equal(describeProfile(wpProfile("demo.example.com")), "demo.example.com · wp-cli · rsync");
  assert.equal(describeProfile({ ssh: {}, database: { executable: "auto" }, files: {} }), "unknown host · MariaDB/MySQL · rsync");
});
