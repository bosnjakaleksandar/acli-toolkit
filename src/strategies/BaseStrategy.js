export default class BaseStrategy {
  constructor(envService) {
    this.envService = envService;
  }

  async askQuestions(ctx) {
    return ctx;
  }

  async scaffold(targetDir, ctx) {
    throw new Error("scaffold must be implemented by the strategy subclass");
  }

  getTemplateType() {
    throw new Error("getTemplateType must be implemented");
  }

  async scaffoldEnvironment(targetDir, ctx, spinner = null) {
    if (this.envService) {
      await this.envService.scaffold(targetDir, this.getTemplateType(), ctx, spinner);
    }
  }
}
