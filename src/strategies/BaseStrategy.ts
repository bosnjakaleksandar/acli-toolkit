import type EnvironmentService from "../services/EnvironmentService.ts";
import type { Spinner } from "../services/EnvironmentService.ts";

export default class BaseStrategy {
  envService: EnvironmentService | null;

  constructor(envService: EnvironmentService | null) {
    this.envService = envService;
  }

  async askQuestions(ctx: any, options?: { nonInteractive?: boolean }): Promise<any> {
    return ctx;
  }

  async scaffold(targetDir: string, ctx: any, spinner?: Spinner | null): Promise<void> {
    throw new Error("scaffold must be implemented by the strategy subclass");
  }

  getTemplateType(): string {
    throw new Error("getTemplateType must be implemented");
  }

  async scaffoldEnvironment(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    if (this.envService) {
      await this.envService.scaffold(targetDir, this.getTemplateType(), ctx, spinner);
    }
  }
}
