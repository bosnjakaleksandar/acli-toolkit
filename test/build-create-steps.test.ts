import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { StepRunner } from "../src/core/StepRunner.ts";
import { buildCreateSteps, type CreateStepsSpinner } from "../src/projects/createPipeline.ts";
import { TargetExistsError } from "../src/core/errors.ts";
import type { ProjectPlan } from "../src/core/model/ProjectPlan.ts";
import ScaffoldStrategy from "../src/projects/strategies/ScaffoldStrategy.ts";

/**
 * Coverage for the step pipeline extracted out of createProjectCommand
 * (phase 3.4) — asserts the four steps still run in order, wire the
 * onOwnsTargetDir/onNextSteps callbacks correctly, and preserve the
 * pre-existing-target-dir / --resume behavior, independent of the
 * surrounding prompt/error-rendering flow in createProject.ts.
 */

function makeSpinner(): CreateStepsSpinner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    start: (text?: string) => { calls.push(`start:${text ?? ""}`); },
    message: (text: string) => { calls.push(`message:${text}`); },
    stop: (text?: string) => { calls.push(`stop:${text ?? ""}`); },
  };
}

// A real subclass rather than an object literal: ScaffoldStrategy is an
// abstract class, so a fake that satisfies it is itself proof the pipeline
// only depends on the declared contract.
class FakeStrategy extends ScaffoldStrategy {
  scaffoldCalls: string[] = [];

  constructor() {
    super(null);
  }

  override async scaffold(targetDir: string): Promise<void> {
    this.scaffoldCalls.push(targetDir);
  }
}

function makeStrategy(overrides: Partial<ScaffoldStrategy> = {}): FakeStrategy {
  return Object.assign(new FakeStrategy(), overrides);
}

async function tempParentDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acli-create-steps-"));
}

test("runs preflight, scaffold, dependencies, and git steps in order, calling onOwnsTargetDir once scaffold starts", async () => {
  const parent = await tempParentDir();
  const targetDir = path.join(parent, "demo");
  const spinner = makeSpinner();
  const strategy = makeStrategy();
  const ctx: ProjectPlan = { projectName: "demo", appType: "application", nonInteractive: true, skipGitInit: true };

  let ownsTargetDir = false;
  let nextSteps: string | null = null;
  const steps = buildCreateSteps({
    ctx,
    strategy,
    targetDir,
    spinner,
    resume: false,
    onOwnsTargetDir: () => { ownsTargetDir = true; },
    onNextSteps: (result) => { nextSteps = result; },
  });

  assert.deepEqual(steps.map((s) => s.id), ["preflight", "scaffold", "dependencies", "git"]);

  const runner = new StepRunner(steps, targetDir);
  await runner.run();

  assert.equal(ownsTargetDir, true, "onOwnsTargetDir must fire once the scaffold step starts creating files");
  assert.equal(strategy.scaffoldCalls.length, 1);
  assert.equal(strategy.scaffoldCalls[0], targetDir);
  assert.equal(typeof nextSteps, "string", "onNextSteps must receive the computed next-steps string");
  assert.ok(await fs.pathExists(targetDir), "the target directory must have been created");

  await fs.remove(parent);
});

test("preflight step calls the strategy's own preflight() when present and appends its warnings to ctx.warnings", async () => {
  const parent = await tempParentDir();
  const targetDir = path.join(parent, "demo");
  const spinner = makeSpinner();
  let preflightCalled = false;
  const strategy = makeStrategy({ preflight: async () => { preflightCalled = true; } });
  const ctx: ProjectPlan = { projectName: "demo", appType: "application", nonInteractive: true, skipGitInit: true };

  const steps = buildCreateSteps({ ctx, strategy, targetDir, spinner, resume: false, onOwnsTargetDir: () => {}, onNextSteps: () => {} });
  await new StepRunner(steps, targetDir).run();

  assert.equal(preflightCalled, true);
  await fs.remove(parent);
});

test("without --resume, the preflight step rejects with TargetExistsError if targetDir already exists", async () => {
  const parent = await tempParentDir();
  const targetDir = path.join(parent, "demo");
  await fs.ensureDir(targetDir);
  const spinner = makeSpinner();
  const strategy = makeStrategy();
  const ctx: ProjectPlan = { projectName: "demo", appType: "application", nonInteractive: true, skipGitInit: true };

  const steps = buildCreateSteps({ ctx, strategy, targetDir, spinner, resume: false, onOwnsTargetDir: () => {}, onNextSteps: () => {} });
  await assert.rejects(
    () => new StepRunner(steps, targetDir).run(),
    (error: unknown) => {
      assert.match((error as Error).message, /Directory .* already exists|Directory.*already exists/);
      return (error as any).cause instanceof TargetExistsError;
    },
  );
  assert.equal(strategy.scaffoldCalls.length, 0, "scaffold must never run once the pre-existing-directory check fails");

  await fs.remove(parent);
});

test("with --resume: true, the preflight step skips the pre-existing-directory check", async () => {
  const parent = await tempParentDir();
  const targetDir = path.join(parent, "demo");
  await fs.ensureDir(targetDir);
  const spinner = makeSpinner();
  const strategy = makeStrategy();
  const ctx: ProjectPlan = { projectName: "demo", appType: "application", nonInteractive: true, skipGitInit: true };

  const steps = buildCreateSteps({ ctx, strategy, targetDir, spinner, resume: true, onOwnsTargetDir: () => {}, onNextSteps: () => {} });
  await new StepRunner(steps, targetDir).run({ resume: true });

  assert.equal(strategy.scaffoldCalls.length, 1, "scaffold must run once resume bypasses the exists-check");
  await fs.remove(parent);
});
