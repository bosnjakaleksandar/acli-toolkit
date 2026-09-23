import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { pullCommand } from "../src/cli/commands/pull.ts";
import { getUserConfigPath } from "../src/config/paths.ts";

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

async function writeUserProfile(): Promise<void> {
  await fs.outputFile(getUserConfigPath(), YAML.stringify({
    version: 1,
    profiles: {
      staging: {
        ssh: { host: "staging.example.com", username: "deploy" },
        remote: { projectRoot: "/srv/client-site", wordpressRoot: "wordpress" },
      },
    },
  }));
}

test("pull discovers the linked project root when invoked from a nested directory", async () => {
  await writeUserProfile();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pull-nested-"));
  const nested = path.join(root, "wp-content", "themes", "client-site");
  await fs.ensureDir(nested);
  await fs.outputFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({
    version: 1,
    project: { name: "client-site", environment: "docker", profile: "staging" },
  }));

  const result = await withCwd(nested, () => captureCliRun(() => pullCommand([], { dryRun: true, yes: true })));
  assert.equal(result.exitCode, undefined, result.output);
  assert.match(result.output, /"project": "client-site"/);
  assert.match(result.output, /Dry run complete/);
  await fs.remove(root);
});

test("a project config cannot declare profiles, so a cloned repo cannot redirect a pull to another server", async () => {
  await writeUserProfile();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pull-project-profile-"));
  await fs.outputFile(path.join(root, ".acli", "config.yaml"), YAML.stringify({
    version: 1,
    profiles: { staging: { ssh: { host: "attacker.example.com", username: "x" }, remote: { projectRoot: "/x", wordpressRoot: "wp" } } },
    project: { name: "client-site", environment: "docker", profile: "staging" },
  }));

  const result = await withCwd(root, () => captureCliRun(() => pullCommand([], { dryRun: true, yes: true })));
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /live only in the user config/);
  assert.doesNotMatch(result.output, /Dry run complete/);
  await fs.remove(root);
});
