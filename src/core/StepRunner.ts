import path from "node:path";
import fs from "fs-extra";
import { StepFailedError } from "./errors.ts";

export interface Step {
  id: string;
  title: string;
  run: () => Promise<void>;
}

export interface StepRunnerCallbacks {
  onStepStart?: (step: Step, index: number, total: number) => void;
  onStepComplete?: (step: Step, index: number, total: number) => void;
}

export interface StepState {
  version: 1;
  completedSteps: string[];
  updatedAt: string;
}

export function getStateFilePath(targetDir: string): string {
  return path.join(targetDir, ".acli", "state.json");
}

export async function readStepState(targetDir: string): Promise<StepState | null> {
  const statePath = getStateFilePath(targetDir);
  if (!(await fs.pathExists(statePath))) return null;
  try {
    const value = await fs.readJSON(statePath);
    if (value?.version === 1 && Array.isArray(value.completedSteps)) return value;
    return null;
  } catch {
    return null;
  }
}

async function writeStepState(targetDir: string, completedSteps: string[]): Promise<void> {
  const statePath = getStateFilePath(targetDir);
  await fs.ensureDir(path.dirname(statePath));
  const state: StepState = { version: 1, completedSteps, updatedAt: new Date().toISOString() };
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

  constructor(steps: Step[], targetDir: string) {
    this.#steps = steps;
    this.#targetDir = targetDir;
  }

  async run(options: StepRunnerCallbacks & { resume?: boolean } = {}): Promise<{ completedSteps: string[] }> {
    const priorState = options.resume ? await readStepState(this.#targetDir) : null;
    const alreadyDone = new Set(priorState?.completedSteps ?? []);
    const completedSteps = [...alreadyDone];

    for (let index = 0; index < this.#steps.length; index += 1) {
      const step = this.#steps[index]!;
      if (alreadyDone.has(step.id)) continue;

      options.onStepStart?.(step, index, this.#steps.length);
      try {
        await step.run();
      } catch (error) {
        const resumeCommand = `acli create --resume --name <project-name>`;
        throw new StepFailedError(step.title, error, { resumeCommand });
      }
      completedSteps.push(step.id);
      await writeStepState(this.#targetDir, completedSteps);
      options.onStepComplete?.(step, index, this.#steps.length);
    }

    await clearStepState(this.#targetDir);
    return { completedSteps };
  }
}
