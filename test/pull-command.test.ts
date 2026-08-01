import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { pullCommand } from "../src/cli/commands/pull.ts";
import { trustConfig } from "../src/config/TrustStore.ts";

process.env.ACLI_QUIET = "1";
process.env.ACLI_CONFIG_HOME = path.join(os.tmpdir(), `acli-pull-command-tests-${process.pid}`);

async function withCwd<T>(directory: string, run: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(directory);
  try {
    return await run();
  } finally {
    process.chdir(original);
  }
}

async function captureCliRun(run: () => Promise<void>): Promise<{ exitCode: number | undefined; output: string }> {
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let output = "";
  process.exitCode = undefined;
  process.stdout.write = ((chunk: unknown) => { output += String(chunk); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { output += String(chunk); return true; }) as typeof process.stderr.write;
  try {
    await run();
    return { exitCode: process.exitCode, output };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}

test("pull discovers the linked project root when invoked from a nested directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pull-nested-"));
  const nested = path.join(root, "wp-content", "themes", "client-site");
  await fs.ensureDir(path.join(root, ".acli"));
  await fs.ensureDir(nested);
  await fs.writeFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({
    version: 1,
    project: {
      name: "client-site",
      environment: "docker",
      profile: {
        ssh: { host: "staging.example.com", username: "deploy" },
        remote: { projectRoot: "/srv/client-site", wordpressRoot: "wordpress" },
        database: { driver: "wp-cli" },
      },
    },
  }));

  const result = await withCwd(nested, () => captureCliRun(() => pullCommand([], { dryRun: true, yes: true })));
  assert.equal(result.exitCode, undefined);
  assert.match(result.output, /"project": "client-site"/);
  assert.match(result.output, /Dry run complete/);
  await fs.remove(root);
});

test("pull refuses a secret command in an untrusted profile referenced by the project link", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pull-untrusted-profile-"));
  await fs.ensureDir(path.join(root, ".acli"));
  await fs.writeFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({
    version: 1,
    project: { name: "client-site", environment: "docker", profile: "./portable.yaml" },
  }));
  const profilePath = path.join(root, "portable.yaml");
  const portableText = YAML.stringify({
    profile: {
      ssh: { host: "staging.example.com", username: "deploy" },
      remote: { projectRoot: "/srv/client-site", wordpressRoot: "wordpress" },
      database: { driver: "direct", password: { command: "definitely-not-a-real-command" } },
    },
  });
  await fs.writeFile(profilePath, portableText);

  const result = await withCwd(root, () => captureCliRun(() => pullCommand([], { dryRun: true, yes: true })));
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Refusing to resolve secrets from profile source/);
  assert.doesNotMatch(result.output, /ENOENT|definitely-not-a-real-command.*not found/);

  await trustConfig(profilePath, portableText);
  const trustedDryRun = await withCwd(root, () => captureCliRun(() => pullCommand([], { dryRun: true, yes: true })));
  assert.equal(trustedDryRun.exitCode, undefined, trustedDryRun.output);
  assert.match(trustedDryRun.output, /Dry run complete/);
  assert.doesNotMatch(trustedDryRun.output, /ENOENT|definitely-not-a-real-command.*not found/);
  await fs.remove(root);
});
