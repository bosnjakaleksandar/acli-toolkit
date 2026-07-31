import fs from "fs-extra";
import { TargetExistsError } from "../core/errors.ts";
import { runLocalPreflight } from "../system/preflight.ts";
import { buildNextSteps } from "./nextSteps.ts";
import { maybeInstallDependencies } from "../system/dependencies.ts";
import { maybeInitializeGit } from "../system/git.ts";
import type { Step } from "../core/StepRunner.ts";
import type ScaffoldStrategy from "./strategies/ScaffoldStrategy.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

/** The subset of @clack/prompts' spinner this module actually calls, always unconditionally (unlike the looser, optional-methods `Spinner` shape services accept). */
export interface CreateStepsSpinner {
  start(text?: string): void;
  message(text: string): void;
  stop(text?: string): void;
}

export interface BuildCreateStepsOptions {
  ctx: ProjectPlan;
  strategy: ScaffoldStrategy;
  targetDir: string;
  spinner: CreateStepsSpinner;
  resume: boolean;
  /** Called once the "scaffold" step starts creating files, so the caller's error handler knows targetDir may already hold recoverable work. */
  onOwnsTargetDir: () => void;
  /** Called by the "dependencies" step with what it computed — createProjectCommand needs this after the run finishes, for its own success summary. */
  onNextSteps: (nextSteps: string) => void;
}

/**
 * Builds the four-step `create` pipeline (preflight, scaffold, dependencies,
 * git) as plain `Step[]` data — the actual sequencing, resume behavior, and
 * error wrapping stay StepRunner's job; this only decides what each step
 * does. Extracted out of createProjectCommand so the step logic can be read
 * (and, if needed, tested) independent of the surrounding prompt/error-UI
 * flow.
 */
export function buildCreateSteps({ ctx, strategy, targetDir, spinner, resume, onOwnsTargetDir, onNextSteps }: BuildCreateStepsOptions): Step[] {
  const totalSteps = 4;
  return [
    {
      id: "preflight",
      title: "Validating project and requirements",
      run: async () => {
        spinner.start(`1/${totalSteps} Validating project and requirements...`);
        if (!resume) await assertTargetDoesNotExist(targetDir);
        const preflight = await runLocalPreflight(ctx);
        ctx.warnings = [...((ctx.warnings as string[]) || []), ...preflight.warnings];
        await strategy.preflight?.(ctx, spinner);
      },
    },
    {
      id: "scaffold",
      title: "Creating project files",
      run: async () => {
        spinner.message(`2/${totalSteps} Creating project files...`);
        await fs.ensureDir(targetDir);
        onOwnsTargetDir();
        await strategy.scaffold(targetDir, ctx, spinner);
        spinner.stop(`2/${totalSteps} Project files created.`);
      },
    },
    {
      id: "dependencies",
      title: "Preparing dependencies",
      run: async () => {
        const installPlan = await buildNextSteps(targetDir, ctx);
        spinner.start(`3/${totalSteps} Preparing dependencies...`);
        spinner.stop(`3/${totalSteps} Dependency plan ready.`);
        const nextSteps = await maybeInstallDependencies(installPlan, spinner, ctx);
        (ctx as any).dependenciesInstalled = !nextSteps.includes(" install");
        onNextSteps(nextSteps);
      },
    },
    {
      id: "git",
      title: "Initializing Git repository",
      run: async () => {
        spinner.start(`4/${totalSteps} Initializing Git repository...`);
        const git = await maybeInitializeGit(targetDir, ctx as any);
        spinner.stop(git.initialized ? `4/${totalSteps} Git repository initialized.` : `4/${totalSteps} Git initialization skipped.`);
      },
    },
  ];
}

async function assertTargetDoesNotExist(targetDir: string): Promise<void> {
  if (!(await fs.pathExists(targetDir))) return;
  throw new TargetExistsError(targetDir);
}
