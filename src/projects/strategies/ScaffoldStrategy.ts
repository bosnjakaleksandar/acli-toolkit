import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

/**
 * What every project type must supply to be scaffolded by `acli create`.
 * `scaffold` is the only required piece; the rest have defaults or are
 * opt-in hooks the create pipeline calls when a strategy implements them.
 *
 * This replaces a pair of competing declarations — an abstract-ish
 * `BaseStrategy` whose unimplemented methods threw at runtime, and a
 * separate all-optional `ScaffoldStrategy` interface in the registry that
 * existed only to describe the same thing loosely enough for untyped JS.
 * With the strategies converted to TypeScript, one abstract class states
 * the contract and the compiler enforces it.
 */
export default abstract class ScaffoldStrategy {
  envService: EnvironmentService | null;

  constructor(envService: EnvironmentService | null) {
    this.envService = envService;
  }

  /** Collects any settings only this project type needs. Defaults to leaving the plan untouched. */
  async askQuestions(ctx: ProjectPlan, options?: { nonInteractive?: boolean }): Promise<ProjectPlan> {
    return ctx;
  }

  abstract scaffold(targetDir: string, ctx: ProjectPlan, spinner?: Spinner | null): Promise<void>;

  /** Opt-in: verifies this project type's own requirements before any files are written. */
  preflight?(ctx: ProjectPlan, spinner?: Spinner | null): Promise<void>;

  /** Opt-in: a richer `--dry-run` plan than the generic {preset, project, projectType, localEnvironment} fallback. */
  buildPlan?(ctx: ProjectPlan): unknown;
}

/**
 * The base for project types that also scaffold a local Docker/Lando
 * environment from a template. `getTemplateType`/`scaffoldEnvironment` live
 * here rather than on `ScaffoldStrategy` because application projects
 * (React, Next.js, Laravel) are run by their own dev servers and never
 * scaffold an environment — they used to inherit a `getTemplateType()` that
 * existed only to throw if anything ever called it.
 */
export abstract class EnvironmentScaffoldStrategy extends ScaffoldStrategy {
  /** Which template under `src/templates/<adapter>/` this project type generates. */
  abstract getTemplateType(): string;

  async scaffoldEnvironment(targetDir: string, ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    if (this.envService) {
      await this.envService.scaffold(targetDir, this.getTemplateType(), ctx, spinner);
    }
  }
}
