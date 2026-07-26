import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { loadConfig } from "../src/config/ConfigLoader.ts";
import { deepMerge } from "../src/config/merge.ts";
import { getUserConfigPath } from "../src/config/paths.ts";
import { redactSecrets } from "../src/config/redaction.ts";
import { resolveReferences } from "../src/config/references.ts";
import { validateConfig, validateProfileConfig } from "../src/config/schema.ts";
import { normalizeProfile } from "../src/profiles/normalizeProfile.ts";
import { writeConfigAtomic } from "../src/config/ConfigWriter.ts";
import { isConfigTrusted, trustConfig } from "../src/config/TrustStore.ts";

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

const attackerProfileYaml = `version: 1
profiles:
  attacker:
    type: wordpress
    ssh:
      host: h.example.com
      username: u
    remote:
      projectRoot: /r
      wordpressRoot: w
    database:
      driver: direct
      password: { command: "echo pwned" }
`;

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

test("configuration validation rejects a secret command reference hidden under an arbitrary defaults/presets key", () => {
  assert.throws(() => validateConfig({ version: 1, defaults: { evil: { command: "id" } } }), /nested objects, including secret "command" references, are not allowed/);
  assert.throws(() => validateConfig({ version: 1, presets: { p: { evil: { command: "id" } } } }), /nested objects, including secret "command" references, are not allowed/);
});

test("configuration validation accepts plain scalars and arrays of scalars in defaults/presets", () => {
  const config = { version: 1, defaults: { mysqlVersion: "8.0", flag: true, count: 3 }, presets: { p: { plugins: ["a", "b"], useLaravel: false } } };
  assert.deepEqual(validateConfig(config), config);
});

test("loadConfig refuses to resolve secrets from an untrusted, auto-discovered project config", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-cwd-"));
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-home-"));
  const projectConfigPath = path.join(cwd, ".acli", "config.yaml");
  await fs.ensureDir(path.dirname(projectConfigPath));
  await fs.writeFile(projectConfigPath, attackerProfileYaml);
  const env = { ...process.env, ACLI_CONFIG_HOME: configHome };

  await assert.rejects(() => loadConfig({ cwd, env }), /Refusing to resolve secrets/);

  // resolveSecrets:false (used by `config validate`/`show` without --resolved) never triggers the check.
  const unresolved = await loadConfig({ cwd, env, resolveSecrets: false });
  assert.ok(unresolved.rawConfig.profiles.attacker);

  // ACLI_TRUST_PROJECT_CONFIG=1 bypasses the check for a single run.
  const bypassed = await loadConfig({ cwd, env: { ...env, ACLI_TRUST_PROJECT_CONFIG: "1" } });
  assert.equal(bypassed.config.profiles.attacker.database.password, "pwned");

  // Trusting the file's current content (as `acli config trust` would) allows it through, without the bypass flag.
  await trustConfig(projectConfigPath, attackerProfileYaml, env);
  const trusted = await loadConfig({ cwd, env });
  assert.equal(trusted.config.profiles.attacker.database.password, "pwned");

  // Editing the file after trusting it invalidates the previous approval (content-hash pinning, like direnv).
  await fs.writeFile(projectConfigPath, attackerProfileYaml.replace("echo pwned", "echo pwned2"));
  await assert.rejects(() => loadConfig({ cwd, env }), /Refusing to resolve secrets/);

  await fs.remove(cwd);
  await fs.remove(configHome);
});

test("writeConfigAtomic trusts the config it just wrote, so A-CLI's own writes never trigger the project-config trust check", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-write-"));
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "acli-trust-home-"));
  await withEnv({ ACLI_CONFIG_HOME: configHome }, async () => {
    const filePath = path.join(dir, "config.yaml");
    await writeConfigAtomic(filePath, {
      version: 1,
      profiles: { p: { type: "wordpress", ssh: { host: "h", username: "u" }, remote: { projectRoot: "/r", wordpressRoot: "w" }, database: { driver: "direct", password: { command: "echo x" } } } },
    });
    const content = await fs.readFile(filePath, "utf8");
    assert.equal(await isConfigTrusted(filePath, content), true);
  });
  await fs.remove(dir);
  await fs.remove(configHome);
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
