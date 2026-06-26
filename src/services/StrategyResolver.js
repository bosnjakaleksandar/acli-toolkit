import NextjsStrategy from "../strategies/NextjsStrategy.js";
import ReactStrategy from "../strategies/ReactStrategy.js";
import WordPressStrategy from "../strategies/WordPressStrategy.js";
import LaravelStrategy from "../strategies/LaravelStrategy.js";
import ExistingWPStrategy from "../strategies/ExistingWPStrategy.js";

/**
 * Resolves the project scaffold strategy from a normalized CLI context.
 *
 * @param {object} ctx Project context.
 * @param {import("../services/EnvironmentService.js").default} envService Environment service.
 * @returns {import("../strategies/BaseStrategy.js").default}
 */
export function resolveStrategy(ctx, envService) {
  if (ctx.setupType === "existing-wp") {
    return new ExistingWPStrategy(envService);
  }

  if (ctx.appType === "application") {
    const frontendStrategy =
      ctx.framework === "nextjs"
        ? new NextjsStrategy(envService)
        : new ReactStrategy(envService);

    return ctx.useLaravel
      ? new LaravelStrategy(envService, frontendStrategy)
      : frontendStrategy;
  }

  return new WordPressStrategy(envService);
}
