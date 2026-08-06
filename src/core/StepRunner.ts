import path from "node:path";
import crypto from "node:crypto";
import fs from "fs-extra";
import { StepFailedError } from "./errors.ts";

export interface Step {
  id: string;
  title: string;
  /** May return data to persist under this step's id in state.json's `stepData` — see `onSkip`. */
  run: () => Promise<unknown>;
  /**
   * Called instead of `run()` when this step was already completed in a
   * prior run and is being skipped on resume, with whatever `run()` returned
   * last time (or undefined, for older state / steps that returned nothing).
   * Lets a step's caller-side effects (e.g. setting a field on a shared
   * context object) happen on resume without re-executing the step itself —
   * without this, any step whose result only ever lived in an in-memory
   * closure would silently lose that result when skipped on resume.
   */
  onSkip?: (data: unknown) => void;
}

export interface StepRunnerCallbacks {
  onStepStart?: (step: Step, index: number, total: number) => void;
  onStepComplete?: (step: Step, index: number, total: number) => void;
}

export interface StepState {
  version: 3;
  completedSteps: string[];
  stepData: Record<string, unknown>;
  fingerprint: string;
  updatedAt: string;
}

export function getStateFilePath(targetDir: string): string {
  return path.join(targetDir, ".acli", "state.json");
}

/**
 * Reads a persisted run's state, or null if none exists / it's unreadable /
 * it predates the current state shape. A `version: 1` file (no `stepData`,
 * and written before step IDs were reordered for the import workflow) is
 * deliberately treated as unresumable rather than partially trusted — resuming
 * against it could skip steps that never actually ran under the current step
 * sequence. State versions before v3 also lack the plan fingerprint needed
 * to prove the current options match the interrupted run, so callers surface
 * them as "nothing to resume"; the safe fix is to restart the run.
 */
export async function readStepState(targetDir: string): Promise<StepState | null> {
  const statePath = getStateFilePath(targetDir);
  if (!(await fs.pathExists(statePath))) return null;
  try {
    const value = await fs.readJSON(statePath);
    if (value?.version === 3 && Array.isArray(value.completedSteps) && value.stepData && typeof value.stepData === "object" && typeof value.fingerprint === "string") return value;
    return null;
  } catch {
    return null;
  }
}

async function writeStepState(targetDir: string, completedSteps: string[], stepData: Record<string, unknown>, fingerprint: string): Promise<void> {
  const statePath = getStateFilePath(targetDir);
  await fs.ensureDir(path.dirname(statePath));
  const state: StepState = { version: 3, completedSteps, stepData, fingerprint, updatedAt: new Date().toISOString() };
  await fs.writeJSON(statePath, state, { spaces: 2 });
}

export async function clearStepState(targetDir: string): Promise<void> {
  await fs.remove(getStateFilePath(targetDir)).catch(() => {});
}

/**
 * Runs an ordered list of steps, persisting progress to `<targetDir>/.acli/state.json`
 * after each one so a failed run can be resumed instead of restarted. No step
 * may catch-and-continue past its own failure — a thrown error always stops
 * the whole run and surfaces as a `StepFailedError` naming which step broke,
 * with the original error preserved as `.cause` for `describeError()`.
 *
 * This replaces two things the previous implementation did poorly: silently
 * swallowing a failed remote step and reporting success anyway, and deleting
 * the entire target directory on any failure regardless of how much of the
 * run had already completed.
 */
export class StepRunner {
  #steps: Step[];
  #targetDir: string;
  #resumeCommand?: string;
  #fingerprint: string;

  /**
   * @param resumeCommand The exact command the user should run to continue
   * a failed run from where it left off — surfaced via StepFailedError. Left
   * undefined to omit the hint entirely rather than guess it; StepRunner has
   * no way to know which CLI command (create, import, ...) is driving it.
   */
  constructor(steps: Step[], targetDir: string, { resumeCommand, fingerprint }: { resumeCommand?: string; fingerprint?: unknown } = {}) {
    this.#steps = steps;
    this.#targetDir = targetDir;
    this.#resumeCommand = resumeCommand;
    this.#fingerprint = createFingerprint({ stepIds: steps.map((step) => step.id), context: fingerprint ?? null });
  }

  async run(options: StepRunnerCallbacks & { resume?: boolean } = {}): Promise<{ completedSteps: string[]; stepData: Record<string, unknown> }> {
    const priorState = options.resume ? await readStepState(this.#targetDir) : null;
    if (options.resume && priorState && priorState.fingerprint !== this.#fingerprint) {
      throw new Error(
        "Cannot resume because the project plan, profile, environment, or step sequence changed since the interrupted run. Re-run with the original options, or start a fresh project without --resume.",
      );
    }
    const alreadyDone = new Set(priorState?.completedSteps ?? []);
    const completedSteps = [...alreadyDone];
    const stepData: Record<string, unknown> = { ...(priorState?.stepData ?? {}) };

    for (let index = 0; index < this.#steps.length; index += 1) {
      const step = this.#steps[index]!;
      if (alreadyDone.has(step.id)) {
        step.onSkip?.(stepData[step.id]);
        continue;
      }

      options.onStepStart?.(step, index, this.#steps.length);
      let result: unknown;
      try {
        result = await step.run();
      } catch (error) {
        throw new StepFailedError(step.title, error, { resumeCommand: this.#resumeCommand });
      }
      stepData[step.id] = result;
      completedSteps.push(step.id);
      await writeStepState(this.#targetDir, completedSteps, stepData, this.#fingerprint);
      options.onStepComplete?.(step, index, this.#steps.length);
    }

    await clearStepState(this.#targetDir);
    return { completedSteps, stepData };
  }
}

function createFingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
