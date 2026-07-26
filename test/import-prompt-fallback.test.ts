import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { importCommand } from "../src/cli/commands/import.ts";

// See test/import-command-unification.test.ts for why ACLI_QUIET is set and
// why failure-path assertions here check process.exitCode rather than
// expecting a rejected promise.
process.env.ACLI_QUIET = "1";

/**
 * Coverage for importCommand's interactive-prompt fallback for missing
 * required fields (source, name, and whichever fields the chosen source
 * itself needs) — added so the top-level `acli` menu's "Import" choice,
 * which calls importCommand with no pre-supplied options at all, works
 * instead of immediately failing on a missing --name. These tests only
 * exercise the --yes/non-interactive branch of that fallback (a clean
 * failure, not a hang on a prompt with no TTY); the interactive prompts
 * themselves, and the missing---name-with-no---source-either case, were
 * verified manually. importCommand's intro()/error banners print
 * regardless of ACLI_QUIET, and this runner's IPC-based TAP reporting
 * corrupts intermittently ("Unable to deserialize cloned data") once
 * enough of that printed output accumulates in one file — captureCliRun
 * silences stdout/stderr for the duration of each real invocation since
 * these tests only assert on process.exitCode.
 */

async function withCwd<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(original);
  }
}

async function captureCliRun(fn: () => Promise<void>): Promise<{ exitCode: number | undefined }> {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    await fn();
    return { exitCode: process.exitCode };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}

test("--source local without --local-path fails clearly (MissingOptionError) instead of hanging on a prompt when --yes is set", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-cli-local-nopath-"));
  const { exitCode } = await withCwd(dir, () =>
    captureCliRun(() => importCommand({ source: "local", name: "demo", dryRun: true, yes: true })),
  );
  assert.equal(exitCode, 2, "MissingOptionError uses exitCode 2");
  await fs.remove(dir);
});

test("--source ssh without any --ssh-* flags fails clearly (MissingOptionError) instead of hanging on a prompt when --yes is set", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-cli-ssh-noflags-"));
  const { exitCode } = await withCwd(dir, () =>
    captureCliRun(() => importCommand({ source: "ssh", name: "demo", dryRun: true, yes: true })),
  );
  assert.equal(exitCode, 2, "MissingOptionError uses exitCode 2");
  await fs.remove(dir);
});

