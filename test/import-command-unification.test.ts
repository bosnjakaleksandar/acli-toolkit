import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { importCommand } from "../src/cli/commands/import.ts";
import { createProjectCommand } from "../src/cli/commands/create.ts";
import { saveProfile } from "../src/profiles/ProfileStore.ts";

process.env.ACLI_QUIET = "1";
process.env.ACLI_CONFIG_HOME = path.join(os.tmpdir(), `acli-import-tests-${process.pid}`);

const profile = {
  type: "wordpress",
  ssh: { host: "unreachable.invalid.test", username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { transport: "rsync" },
  database: { driver: "wp-cli" },
  urls: { staging: "https://demo.staging.example.com" },
};

async function withCwd<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(original);
  }
}

async function captureCliRun(fn: () => Promise<void>): Promise<{ exitCode: number | undefined; output: string }> {
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let output = "";
  process.exitCode = undefined;
  process.stdout.write = ((chunk: any) => { output += String(chunk); return true; }) as any;
  process.stderr.write = ((chunk: any) => { output += String(chunk); return true; }) as any;
  try {
    await fn();
    return { exitCode: process.exitCode, output };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}

test("import fails on missing profiles before validating project fields", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-no-profile-"));
  const result = await withCwd(dir, () => captureCliRun(() => importCommand({ yes: true })));

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /No staging profiles are configured/);
  assert.match(result.output, /acli profile create/);
  assert.doesNotMatch(result.output, /Missing required option.*--name/s);
  await fs.remove(dir);
});

test("import automatically uses the sole configured profile", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-one-profile-"));
  const configPath = path.join(dir, "config.yaml");
  await saveProfile("demo", profile as any, { configPath });

  const result = await withCwd(dir, () => captureCliRun(() => importCommand({
    config: configPath,
    name: "profile-import",
    environment: "docker",
    dryRun: true,
    yes: true,
  })));

  assert.equal(result.exitCode, undefined);
  assert.match(result.output, /"profile": "demo"/);
  assert.equal(await fs.pathExists(path.join(dir, "profile-import")), false);
  await fs.remove(dir);
});

test("create --existing returns a usage error and never delegates to import", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-create-existing-"));
  const result = await withCwd(dir, () => captureCliRun(() => createProjectCommand({
    existing: true,
    name: "must-not-import",
    dryRun: true,
    yes: true,
  })));

  assert.equal(result.exitCode, 2);
  assert.match(result.output, /no longer supported/);
  assert.match(result.output, /acli import/);
  assert.equal(await fs.pathExists(path.join(dir, "must-not-import")), false);
  await fs.remove(dir);
});
