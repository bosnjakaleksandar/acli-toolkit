import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { importCommand } from "../src/commands/import.ts";
import { createProjectCommand } from "../src/commands/createProject.ts";
import { saveProfile } from "../src/services/ProfileService.ts";

// The mascot's animated ASCII-art frames write raw cursor-control ANSI
// sequences straight to stdout — running several full commands (which each
// call mascot.show()) back to back in one node:test file risks corrupting
// this runner's own IPC-based TAP reporting ("Unable to deserialize cloned
// data"). --quiet's ACLI_QUIET=1 suppresses that decorative output
// entirely (see acaCharacter.ts) — the same thing a real non-TTY/CI run
// already gets in practice.
process.env.ACLI_QUIET = "1";

/**
 * CLI-level coverage for phase 4: `--source profile`/`--source ssh` no
 * longer delegate to a second `create --existing` pipeline via a
 * predictably-named temp YAML file on disk — they resolve ctx.profile
 * in-memory and run through the same ImportWorkflow every other source
 * uses. `create --existing` itself now delegates the other way, into
 * `importCommand`.
 *
 * Both command functions catch their own errors (print + set
 * process.exitCode, never reject) — matching normal CLI behavior — so
 * failure-path assertions here check process.exitCode rather than
 * expecting a rejected promise.
 *
 * (Coverage for importCommand's interactive-prompt fallback for missing
 * required fields lives in test/import-prompt-fallback.test.ts — split into
 * its own file because this runner's IPC-based TAP reporting corrupts when
 * too many full command invocations print output within a single test file.)
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

/** Runs `fn`, capturing process.exitCode, then restores it regardless of outcome. */
async function captureCliRun(fn: () => Promise<void>): Promise<{ exitCode: number | undefined }> {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return { exitCode: process.exitCode };
  } finally {
    process.exitCode = originalExitCode;
  }
}

test("--source ssh's --dry-run resolves the synthesized profile without ever writing a temp YAML file to disk", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-import-cli-ssh-"));
  const tmpBefore = await fs.readdir(os.tmpdir());

  await withCwd(dir, () =>
    importCommand({
      source: "ssh",
      name: "ssh-import",
      sshHost: "demo.example.com",
      sshUser: "deploy",
      remotePath: "/srv/demo",
      dryRun: true,
      yes: true,
    }),
  );

  const tmpAfter = await fs.readdir(os.tmpdir());
  const newSshFiles = tmpAfter.filter((name) => name.startsWith("acli-import-ssh-") && !tmpBefore.includes(name));
  assert.deepEqual(newSshFiles, [], "no acli-import-ssh-*.yaml temp file should ever be created");
  assert.equal(await fs.pathExists(path.join(dir, "ssh-import")), false, "--dry-run must not create the project directory");

  await fs.remove(dir);
});

test("create --existing forwards --dry-run through to importCommand instead of attempting a real remote connection", async () => {
  // Regression: an earlier version of this delegation forgot to forward
  // dryRun/resume, so `create --existing --dry-run` actually attempted to
  // connect to the (fake, unreachable) host below instead of stopping at
  // the dry-run print. If that regression reappears, this fails with a
  // connection/DNS error and a nonzero exitCode instead of resolving cleanly.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-create-existing-dryrun-"));
  const configPath = path.join(dir, "config.yaml");
  await saveProfile("demo", {
    type: "wordpress",
    ssh: { host: "unreachable.invalid.test", username: "deploy" },
    remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
    files: { transport: "rsync" },
    database: { driver: "wp-cli" },
    urls: { staging: "https://demo.staging.example.com" },
  } as any, { configPath });

  const { exitCode } = await withCwd(dir, () =>
    captureCliRun(() =>
      createProjectCommand({
        existing: true,
        profile: "demo",
        config: configPath,
        name: "existing-import",
        dryRun: true,
        yes: true,
      }),
    ),
  );

  assert.equal(exitCode, undefined, "a successful dry-run must not set a failing exitCode");
  assert.equal(await fs.pathExists(path.join(dir, "existing-import")), false, "--dry-run must not create the project directory");
  await fs.remove(dir);
});

test("create --existing forwards --resume through to importCommand (surfaces import's own NOTHING_TO_RESUME check, not a fresh run)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-create-existing-resume-"));
  const configPath = path.join(dir, "config.yaml");
  await saveProfile("demo", {
    type: "wordpress",
    ssh: { host: "unreachable.invalid.test", username: "deploy" },
    remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
    files: { transport: "rsync" },
    database: { driver: "wp-cli" },
    urls: { staging: "https://demo.staging.example.com" },
  } as any, { configPath });

  const { exitCode } = await withCwd(dir, () =>
    captureCliRun(() =>
      createProjectCommand({ existing: true, profile: "demo", config: configPath, name: "nonexistent-run", resume: true, yes: true }),
    ),
  );

  assert.equal(exitCode, 1, "--resume with no in-progress run must fail (NOTHING_TO_RESUME), not silently start a fresh one");
  await fs.remove(dir);
});
