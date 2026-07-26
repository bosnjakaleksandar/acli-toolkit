import NextjsStrategy from "./NextjsStrategy.ts";
import ReactStrategy from "./ReactStrategy.ts";
import WordPressStrategy from "./WordPressStrategy.ts";
import LaravelStrategy from "./LaravelStrategy.ts";
import ScaffoldStrategy from "./ScaffoldStrategy.ts";
import { Registry } from "../../core/Registry.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";

export interface ProjectTypeDefinition {
  id: string;
  label: string;
  /** Does this definition apply to the given (already-normalized) plan? First registered match wins. */
  matches(plan: ProjectPlan): boolean;
  /** Builds the strategy instance for this run. `envService` is the resolved Docker/Lando adapter (or null for env-less application projects). */
  create(envService: EnvironmentService | null, plan: ProjectPlan): ScaffoldStrategy;
}

export const projectTypeRegistry = new Registry<ProjectTypeDefinition>("project type");

projectTypeRegistry.register({
  id: "application",
  label: "Application (React, Next.js, optionally Laravel)",
  matches: (plan) => plan.appType === "application",
  create: (envService, plan) => {
    const frontend = plan.framework === "nextjs" ? new NextjsStrategy(envService) : new ReactStrategy(envService);
    return plan.useLaravel ? new LaravelStrategy(envService, frontend) : frontend;
  },
});

projectTypeRegistry.register({
  id: "wordpress",
  label: "WordPress site",
  // Registered last: acts as the fallback for every plan that isn't an
  // application. Existing-WordPress plans never reach here — `acli create`
  // delegates those to `acli import` before resolving a strategy at all.
  matches: () => true,
  create: (envService) => new WordPressStrategy(envService),
});

/**
 * Resolves the scaffold strategy for a normalized plan. Entries are tried in
 * registration order and the first whose `matches()` returns true wins, so a
 * new project type is one `register()` call above rather than another branch
 * in a shared if-chain.
 */
export function resolveStrategy(ctx: ProjectPlan, envService: EnvironmentService | null): ScaffoldStrategy {
  const definition = projectTypeRegistry.find((candidate) => candidate.matches(ctx));
  if (!definition) {
    throw new Error(`No registered project type matches this plan (setupType=${ctx.setupType}, appType=${ctx.appType}).`);
  }
  return definition.create(envService, ctx);
}
