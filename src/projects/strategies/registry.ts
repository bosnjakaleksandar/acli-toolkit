import NextjsStrategy from "./NextjsStrategy.ts";
import ReactStrategy from "./ReactStrategy.ts";
import WordPressStrategy from "./WordPressStrategy.ts";
import LaravelStrategy from "./LaravelStrategy.ts";
import ExistingWPStrategy from "./ExistingWPStrategy.ts";
import { ProjectTypeRegistry, type ScaffoldStrategy } from "../../core/Registry.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";
import type EnvironmentServiceType from "../../environments/EnvironmentService.ts";

export const projectTypeRegistry = new ProjectTypeRegistry();

projectTypeRegistry.register({
  id: "existing-wp",
  label: "Existing WordPress site",
  matches: (plan) => plan.setupType === "existing-wp",
  create: (envService) => new ExistingWPStrategy(envService as EnvironmentServiceType | null) as ScaffoldStrategy,
});

projectTypeRegistry.register({
  id: "application",
  label: "Application (React, Next.js, optionally Laravel)",
  matches: (plan) => plan.appType === "application",
  create: (envService, plan) => {
    const service = envService as EnvironmentServiceType | null;
    const frontend: ScaffoldStrategy =
      plan.framework === "nextjs" ? new NextjsStrategy(service) : new ReactStrategy(service);
    return plan.useLaravel ? (new LaravelStrategy(service, frontend) as ScaffoldStrategy) : frontend;
  },
});

projectTypeRegistry.register({
  id: "wordpress",
  label: "WordPress site",
  // Registered last: acts as the fallback for every plan that isn't
  // existing-wp or an application, matching the original if-chain's
  // unconditional final `else`.
  matches: () => true,
  create: (envService) => new WordPressStrategy(envService as EnvironmentServiceType | null) as ScaffoldStrategy,
});

/**
 * Resolves the project scaffold strategy from a normalized CLI context.
 * Kept as a thin wrapper over `projectTypeRegistry` so existing call sites
 * don't need to change; new project types register with the registry
 * directly instead of extending an if-chain here.
 */
export function resolveStrategy(ctx: ProjectPlan, envService: unknown): ScaffoldStrategy {
  return projectTypeRegistry.resolve(ctx, envService);
}
