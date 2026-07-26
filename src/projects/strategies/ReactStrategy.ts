import path from "node:path";
import BaseStrategy from "./ScaffoldStrategy.ts";
import { runCommand } from "../../system/commandRunner.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";

type Runner = typeof runCommand;

export default class ReactStrategy extends BaseStrategy {
  run: Runner;

  constructor(envService: EnvironmentService | null, { runner = runCommand }: { runner?: Runner } = {}) {
    super(envService);
    this.run = runner;
  }

  override async scaffold(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Scaffolding with create-vite...");
    const parentDir = path.dirname(targetDir);
    const name = path.basename(targetDir);
    // Delegating to the official generator instead of hand-writing app files
    // means the project always starts from Vite's own current templates and
    // dependency versions, instead of drifting from upstream over time.
    // --no-immediate skips both dependency install and starting the dev
    // server, deferring to acli's own dependency-install step; --no-interactive
    // guarantees no prompt can block a non-interactive create run.
    await this.run("npm", [
      "create", "vite@latest", name, "--",
      "--template", "react",
      "--no-immediate", "--no-interactive",
    ], { cwd: parentDir });
  }
}
