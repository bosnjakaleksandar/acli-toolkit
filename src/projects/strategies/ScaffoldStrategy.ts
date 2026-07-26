import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ProjectPlan } from "../../core/model/ProjectPlan.ts";

export default class BaseStrategy {
  envService: EnvironmentService | null;

  constructor(envService: EnvironmentService | null) {
    this.envService = envService;
  }

  async askQuestions(ctx: ProjectPlan, options?: { nonInteractive?: boolean }): Promise<ProjectPlan> {
    return ctx;
  }

  async scaffold(targetDir: string, ctx: ProjectPlan, spinner?: Spinner | null): Promise<void> {
    throw new Error("scaffold must be implemented by the strategy subclass");
  }

  getTemplateType(): string {
    throw new Error("getTemplateType must be implemented");
  }

  async scaffoldEnvironment(targetDir: string, ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    if (this.envService) {
      await this.envService.scaffold(targetDir, this.getTemplateType(), ctx, spinner);
    }
  }
}
