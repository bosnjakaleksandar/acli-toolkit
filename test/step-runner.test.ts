import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { StepRunner, readStepState, getStateFilePath } from "../src/core/StepRunner.ts";
import { StepFailedError, describeError } from "../src/core/errors.ts";

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acli-step-runner-"));
}

test("runs every step in order and clears the state file on success", async () => {
  const dir = await tempDir();
  const order: string[] = [];
  const runner = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => { order.push("a"); } },
      { id: "b", title: "Step B", run: async () => { order.push("b"); } },
    ],
    dir,
  );
  const result = await runner.run();
  assert.deepEqual(order, ["a", "b"]);
  assert.deepEqual(result.completedSteps, ["a", "b"]);
  assert.equal(await fs.pathExists(getStateFilePath(dir)), false, "state file is cleared once the whole run succeeds");
  await fs.remove(dir);
});

test("persists progress after each step so a mid-run inspection sees partial completion", async () => {
  const dir = await tempDir();
  const seenAfterA: string[][] = [];
  const runner = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => {} },
      {
        id: "b",
        title: "Step B",
        run: async () => {
          const state = await readStepState(dir);
          seenAfterA.push(state?.completedSteps ?? []);
        },
      },
    ],
    dir,
  );
  await runner.run();
  assert.deepEqual(seenAfterA[0], ["a"], "step b should see step a already recorded as completed");
  await fs.remove(dir);
});

test("a failing step throws StepFailedError naming the step and preserves the original error as .cause", async () => {
  const dir = await tempDir();
  const original = new Error("rsync exited with code 23");
  const runner = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => {} },
      { id: "b", title: "Transfer files", run: async () => { throw original; } },
    ],
    dir,
  );

  await assert.rejects(
    () => runner.run(),
    (error: unknown) => {
      assert.ok(error instanceof StepFailedError);
      assert.equal(error.step, "Transfer files");
      assert.equal(error.cause, original);
      assert.match(error.message, /Transfer files.*rsync exited with code 23/s);
      return true;
    },
  );

  const state = await readStepState(dir);
  assert.deepEqual(state?.completedSteps, ["a"], "state file still records the step that did complete before the failure");
  await fs.remove(dir);
});

test("StepFailedError forwards the original command's stderr/stdout so describeError() surfaces the real shell output, not just the wrapper summary", async () => {
  const dir = await tempDir();
  const commandLikeError = Object.assign(new Error("Command failed: rsync -avz ..."), { stderr: "rsync: connection unexpectedly closed", stdout: "" });
  const runner = new StepRunner(
    [{ id: "a", title: "Transfer files", run: async () => { throw commandLikeError; } }],
    dir,
  );

  await assert.rejects(
    () => runner.run(),
    (error: unknown) => {
      assert.ok(error instanceof StepFailedError);
      assert.equal(describeError(error), "rsync: connection unexpectedly closed");
      return true;
    },
  );
  await fs.remove(dir);
});

test("resume: true skips steps already recorded as completed in a prior run", async () => {
  const dir = await tempDir();
  const ran: string[] = [];
  const firstAttempt = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => { ran.push("a-first"); } },
      { id: "b", title: "Step B", run: async () => { throw new Error("boom"); } },
    ],
    dir,
  );
  await assert.rejects(() => firstAttempt.run());
  assert.deepEqual(ran, ["a-first"]);

  const secondAttempt = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => { ran.push("a-second"); } },
      { id: "b", title: "Step B", run: async () => { ran.push("b-second"); } },
    ],
    dir,
  );
  const result = await secondAttempt.run({ resume: true });
  assert.deepEqual(ran, ["a-first", "b-second"], "step a must not re-run once resumed");
  assert.deepEqual(result.completedSteps, ["a", "b"]);
  assert.equal(await fs.pathExists(getStateFilePath(dir)), false);
  await fs.remove(dir);
});

test("without resume: true, a fresh run re-executes every step even if a stale state file exists", async () => {
  const dir = await tempDir();
  const runner1 = new StepRunner([{ id: "a", title: "Step A", run: async () => {} }], dir);
  await runner1.run();
  // Simulate a leftover state file from an unrelated prior run.
  await fs.writeJSON(getStateFilePath(dir), { version: 2, completedSteps: ["a"], stepData: {}, updatedAt: new Date().toISOString() });

  const ran: string[] = [];
  const runner2 = new StepRunner([{ id: "a", title: "Step A", run: async () => { ran.push("a"); } }], dir);
  await runner2.run();
  assert.deepEqual(ran, ["a"], "non-resumed run ignores any existing state file");
  await fs.remove(dir);
});

test("a StepFailedError carries the resumeCommand supplied to the StepRunner constructor, not a hardcoded 'acli create' string", async () => {
  const dir = await tempDir();
  const runner = new StepRunner(
    [{ id: "a", title: "Step A", run: async () => { throw new Error("boom"); } }],
    dir,
    { resumeCommand: "acli import --resume --name demo" },
  );
  await assert.rejects(
    () => runner.run(),
    (error: unknown) => {
      assert.ok(error instanceof StepFailedError);
      assert.equal(error.resumeCommand, "acli import --resume --name demo");
      return true;
    },
  );
  await fs.remove(dir);
});

test("a StepFailedError has no resumeCommand when the StepRunner was constructed without one", async () => {
  const dir = await tempDir();
  const runner = new StepRunner([{ id: "a", title: "Step A", run: async () => { throw new Error("boom"); } }], dir);
  await assert.rejects(
    () => runner.run(),
    (error: unknown) => {
      assert.ok(error instanceof StepFailedError);
      assert.equal(error.resumeCommand, undefined);
      return true;
    },
  );
  await fs.remove(dir);
});

test("a step's return value is persisted under its id and handed to onSkip when that step is skipped on resume", async () => {
  const dir = await tempDir();
  const onSkipCalls: unknown[] = [];
  const firstAttempt = new StepRunner(
    [
      { id: "detect", title: "Detect", run: async () => "xyz_" },
      { id: "fail", title: "Fail", run: async () => { throw new Error("boom"); } },
    ],
    dir,
  );
  await assert.rejects(() => firstAttempt.run());

  const secondAttempt = new StepRunner(
    [
      { id: "detect", title: "Detect", run: async () => { throw new Error("must not re-run a completed step"); }, onSkip: (data) => onSkipCalls.push(data) },
      { id: "fail", title: "Fail", run: async () => {} },
    ],
    dir,
  );
  const result = await secondAttempt.run({ resume: true });
  assert.deepEqual(onSkipCalls, ["xyz_"], "onSkip must receive the value 'detect' returned in the prior run");
  assert.deepEqual(result.stepData, { detect: "xyz_", fail: undefined });
  await fs.remove(dir);
});

test("readStepState treats a pre-v3 state file (no fingerprint, predating safe resume) as unresumable", async () => {
  const dir = await tempDir();
  await fs.outputJSON(getStateFilePath(dir), { version: 1, completedSteps: ["scaffold"], updatedAt: new Date().toISOString() });
  assert.equal(await readStepState(dir), null);
  await fs.remove(dir);
});

test("resume refuses state created for a different plan even when step ids match", async () => {
  const dir = await tempDir();
  const first = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => {} },
      { id: "b", title: "Step B", run: async () => { throw new Error("boom"); } },
    ],
    dir,
    { fingerprint: { command: "create", framework: "react", environment: "docker" } },
  );
  await assert.rejects(() => first.run());

  let resumedStepRan = false;
  const changed = new StepRunner(
    [
      { id: "a", title: "Step A", run: async () => {} },
      { id: "b", title: "Step B", run: async () => { resumedStepRan = true; } },
    ],
    dir,
    { fingerprint: { command: "create", framework: "nextjs", environment: "docker" } },
  );
  await assert.rejects(() => changed.run({ resume: true }), /Cannot resume because the project plan.*changed/s);
  assert.equal(resumedStepRan, false);
  await fs.remove(dir);
});
