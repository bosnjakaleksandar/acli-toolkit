import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { deepMerge, getUserConfigPath, loadConfig, normalizeProfile, redactSecrets, resolveReferences, validateConfig, validateProfileConfig } from "../src/services/ConfigService.js";

test("deep configuration merge preserves lower layers and overrides nested values", () => {
  assert.deepEqual(deepMerge({ defaults: { environment: "docker", mysqlVersion: "8.0" } }, { defaults: { environment: "lando" } }), { defaults: { environment: "lando", mysqlVersion: "8.0" } });
});

test("configuration references resolve explicitly and redact secret fields", () => {
  const value = resolveReferences({ host: "${HOST}", password: { command: "secret read" } }, { env: { HOST: "example.com" }, commandRunner: () => "sensitive" });
  assert.deepEqual(value, { host: "example.com", password: "sensitive" });
  assert.deepEqual(redactSecrets(value), { host: "example.com", password: "[REDACTED]" });
});

test("redactSecrets does not redact *Env fields — they hold an environment variable NAME, never the secret itself", () => {
  const database = { driver: "docker", userEnv: "DB_USER", passwordEnv: "DB_PASSWORD", nameEnv: "DB_NAME" };
  assert.deepEqual(redactSecrets(database), database);
});

test("redactSecrets still redacts the actual password/identityFile/token/secret values", () => {
  const value = { password: "hunter2", identityFile: "/home/user/.ssh/id_ed25519", token: "abc123", secret: "shh" };
  assert.deepEqual(redactSecrets(value), { password: "[REDACTED]", identityFile: "[REDACTED]", token: "[REDACTED]", secret: "[REDACTED]" });
});

test("configuration validation rejects missing versions and unknown fields", () => {
  assert.throws(() => validateConfig({ presets: {}, legacyHost: "x" }), /version must be 1.*unknown top-level field/s);
});

test("explicit config overrides built-in defaults", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-config-"));
  const file = path.join(directory, "config.yaml");
  await fs.writeFile(file, "version: 1\ndefaults:\n  environment: lando\n");
  const { config } = await loadConfig({ configPath: file });
  assert.equal(config.defaults.environment, "lando");
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
