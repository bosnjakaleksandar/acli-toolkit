import type { ProjectPlan } from "../model/ProjectPlan.ts";

/**
 * Minimal shape every scaffold strategy already implements (BaseStrategy and
 * its subclasses). Kept loose (`any` on ctx/spinner) because the strategies
 * themselves are still plain JS — this describes the existing contract
 * rather than forcing a rewrite of it. Tightening this is expected once the
 * strategies convert to TS.
 */
export interface ScaffoldStrategy {
  askQuestions?(ctx: any, options?: { nonInteractive?: boolean }): Promise<any>;
  scaffold(targetDir: string, ctx: any, spinner?: unknown): Promise<void>;
  // Only meaningful for strategies that scaffold a Docker/Lando environment
  // template (WordPress, existing-wp); application strategies (React/Next/
  // Laravel) never call it and inherit BaseStrategy's throwing default,
  // which JS-inference sees as returning void rather than never returning.
  getTemplateType?(): string | void;
  preflight?(ctx: any, spinner?: unknown): Promise<void>;
  buildPlan?(ctx: any): unknown;
}

export interface ProjectTypeDefinition {
  id: string;
  label: string;
  /** Does this definition apply to the given (already-normalized) plan? First registered match wins. */
  matches(plan: ProjectPlan): boolean;
  /** Builds the strategy instance for this run. `envService` is the resolved Docker/Lando adapter (or null for env-less application projects). */
  create(envService: unknown, plan: ProjectPlan): ScaffoldStrategy;
}

/**
 * Replaces the if-chain that used to live in StrategyResolver: adding a new
 * project type is one `register()` call instead of editing a shared
 * function. Entries are tried in registration order; the first whose
 * `matches()` returns true wins, mirroring the original chain's priority
 * (existing-wp before application before wordpress).
 */
export class ProjectTypeRegistry {
  #definitions: ProjectTypeDefinition[] = [];

  register(definition: ProjectTypeDefinition): void {
    if (this.#definitions.some((existing) => existing.id === definition.id)) {
      throw new Error(`A project type with id "${definition.id}" is already registered.`);
    }
    this.#definitions.push(definition);
  }

  list(): ProjectTypeDefinition[] {
    return [...this.#definitions];
  }

  resolve(plan: ProjectPlan, envService: unknown): ScaffoldStrategy {
    const definition = this.#definitions.find((candidate) => candidate.matches(plan));
    if (!definition) {
      throw new Error(`No registered project type matches this plan (setupType=${plan.setupType}, appType=${plan.appType}).`);
    }
    return definition.create(envService, plan);
  }
}
