import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { loadConfig } from "../src/config/ConfigLoader.ts";
import { deepMerge } from "../src/config/merge.ts";
import { getUserConfigPath } from "../src/config/paths.ts";
import { redactSecrets } from "../src/config/redaction.ts";
import { validateConfig, validateProfileConfig } from "../src/config/schema.ts";
import { normalizeProfile } from "../src/profiles/normalizeProfile.ts";
import { writeConfigAtomic } from "../src/config/ConfigWriter.ts";
import { DEFAULT_WORDPRESS_VERSION } from "../src/config/defaults.ts";

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


test("deep configuration merge preserves lower layers and overrides nested values", () => {
  assert.deepEqual(deepMerge({ defaults: { environment: "docker", mysqlVersion: "8.0" } }, { defaults: { environment: "lando" } }), { defaults: { environment: "lando", mysqlVersion: "8.0" } });
});

test("redactSecrets still redacts the actual password/identityFile/token/secret values", () => {
  const value = { password: "hunter2", identityFile: "/home/user/.ssh/id_ed25519", token: "abc123", secret: "shh" };
  assert.deepEqual(redactSecrets(value), { password: "[REDACTED]", identityFile: "[REDACTED]", token: "[REDACTED]", secret: "[REDACTED]" });
});

test("configuration validation rejects missing versions and unknown fields", () => {
  assert.throws(() => validateConfig({ presets: {}, legacyHost: "x" }), /version must be 1.*unknown top-level field/s);
});

test("configuration validation rejects nested objects under defaults", () => {
  assert.throws(() => validateConfig({ version: 1, defaults: { evil: { command: "id" } } }), /nested objects are not allowed/);
});

test("configuration validation ignores an empty leftover presets block and explains a non-empty one", () => {
  assert.doesNotThrow(() => validateConfig({ version: 1, presets: {} }));
  assert.throws(() => validateConfig({ version: 1, presets: { p: { plugins: ["a"] } } }), /presets were removed in A-CLI 2\.1/);
});

test("configuration validation explains that ${ENV_VAR} and {command} references are no longer resolved", () => {
  const profile = { ssh: { host: "h.example.com", username: "u", identityFile: "${ACLI_SSH_KEY}" }, remote: { projectRoot: "/r", wordpressRoot: "w" } };
  assert.throws(() => validateConfig({ version: 1, profiles: { p: profile } }), /profiles\.p\.ssh\.identityFile" uses a \$\{ENV_VAR\}/);
});

test("loadConfig refuses profiles and a default profile declared in the project config", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "acli-project-profiles-"));
  const project = path.join(home, "site");
  await fs.outputFile(path.join(project, ".acli", "config.yaml"), "version: 1\ndefaults:\n  profile: other\n");
  await withEnv({ ACLI_CONFIG_HOME: path.join(home, "config") }, async () => {
    await assert.rejects(() => loadConfig({ cwd: project }), /live only in the user config/);
  });
  await fs.remove(home);
});

test("configuration validation accepts plain scalars and arrays of scalars in defaults", () => {
  const config = { version: 1, defaults: { mysqlVersion: "8.0", flag: true, count: 3, plugins: ["a", "b"] } };
  assert.deepEqual(validateConfig(config), config);
});

test("explicit config overrides built-in defaults", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-config-"));
  const file = path.join(directory, "config.yaml");
  await fs.writeFile(file, "version: 1\ndefaults:\n  environment: lando\n");
  const { config } = await loadConfig({ configPath: file });
  assert.equal(config.defaults.environment, "lando");
  assert.equal(config.defaults.wpVersion, DEFAULT_WORDPRESS_VERSION);
});

test("user config paths are platform appropriate", () => {
  assert.equal(getUserConfigPath("linux", {}, "/home/dev"), "/home/dev/.config/a-cli/config.yaml");
  assert.equal(getUserConfigPath("darwin", {}, "/Users/dev"), "/Users/dev/Library/Application Support/a-cli/config.yaml");
});

const baseProfile = { type: "wordpress", ssh: { host: "example.com", username: "deploy" }, remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" }, database: { driver: "wp-cli" } };

test("normalizeProfile converts legacy directories/excludes into the targets shape", () => {
  const legacy = { ...baseProfile, files: { transport: "rsync", directories: ["uploads", "themes"], excludes: ["*.log"] } };
  const normalized = normalizeProfile(legacy);
  assert.deepEqual(normalized.files.targets, {
    uploads: { path: "wp-content/uploads", excludes: ["*.log"], includes: [] },
    themes: { path: "wp-content/themes", excludes: ["*.log"], includes: [] },
  });
});

test("normalizeProfile defaults to uploads/plugins/themes when neither targets nor directories are declared", () => {
  const normalized = normalizeProfile({ ...baseProfile, files: { transport: "rsync" } });
  assert.deepEqual(Object.keys(normalized.files.targets).sort(), ["plugins", "themes", "uploads"]);
  assert.equal(normalized.files.targets.uploads.path, "wp-content/uploads");
});

test("normalizeProfile passes through unchanged when targets are already declared", () => {
  const alreadyNormalized = { ...baseProfile, files: { transport: "rsync", targets: { uploads: { path: "wp-content/uploads" } } } };
  assert.equal(normalizeProfile(alreadyNormalized), alreadyNormalized);
});

test("validateProfileConfig accepts an explicit files.targets map", () => {
  const profile = { ...baseProfile, files: { transport: "rsync", targets: { uploads: { path: "wp-content/uploads", excludes: ["*.log"] } } } };
  assert.deepEqual(validateProfileConfig(profile), profile);
});

test("validateProfileConfig rejects a target path that escapes the WordPress root", () => {
  const traversal = { ...baseProfile, files: { transport: "rsync", targets: { uploads: { path: "../../etc" } } } };
  assert.throws(() => validateProfileConfig(traversal), /safe relative path/);
  const absolute = { ...baseProfile, files: { transport: "rsync", targets: { uploads: { path: "/etc/passwd" } } } };
  assert.throws(() => validateProfileConfig(absolute), /safe relative path/);
});

test("validateProfileConfig accepts a database.tablePrefix override and rejects a non-string value", () => {
  assert.deepEqual(validateProfileConfig({ ...baseProfile, database: { driver: "wp-cli", tablePrefix: "wp_custom_" } }).database.tablePrefix, "wp_custom_");
  assert.throws(() => validateProfileConfig({ ...baseProfile, database: { driver: "wp-cli", tablePrefix: 123 } }), /tablePrefix must be a string/);
});

test("validateProfileConfig accepts database.normalizeCollations as a boolean and rejects other types", () => {
  assert.equal(validateProfileConfig({ ...baseProfile, database: { driver: "wp-cli", normalizeCollations: false } }).database.normalizeCollations, false);
  assert.throws(() => validateProfileConfig({ ...baseProfile, database: { driver: "wp-cli", normalizeCollations: "no" } }), /normalizeCollations must be a boolean/);
});

test("validateProfileConfig enforces the SSH port range and host-key policy", () => {
  assert.throws(() => validateProfileConfig({ ...baseProfile, ssh: { ...baseProfile.ssh, port: 0 } }), /ssh\.port/);
  assert.throws(() => validateProfileConfig({ ...baseProfile, ssh: { ...baseProfile.ssh, hostKeyPolicy: "whatever" } }), /hostKeyPolicy/);
  assert.doesNotThrow(() => validateProfileConfig({ ...baseProfile, ssh: { ...baseProfile.ssh, port: "2222", hostKeyPolicy: "accept-new" } }));
});

test("validateProfileConfig explains removed ssh database drivers and file transports", () => {
  assert.throws(() => validateProfileConfig({ ...baseProfile, database: { driver: "docker" } }), /database\.driver "docker" is no longer supported/);
  assert.throws(() => validateProfileConfig({ ...baseProfile, files: { transport: "sftp" } }), /files\.transport "sftp" is no longer supported/);
  assert.doesNotThrow(() => validateProfileConfig({ ...baseProfile, database: { driver: "wp-cli" }, files: { transport: "rsync" } }));
});
