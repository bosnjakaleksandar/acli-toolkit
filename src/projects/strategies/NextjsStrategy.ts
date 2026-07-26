import path from "node:path";
import ScaffoldStrategy from "./ScaffoldStrategy.ts";
import { runCommand } from "../../system/commandRunner.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";

type Runner = typeof runCommand;

export default class NextjsStrategy extends ScaffoldStrategy {
  run: Runner;

  constructor(envService: EnvironmentService | null, { runner = runCommand }: { runner?: Runner } = {}) {
    super(envService);
    this.run = runner;
  }

  override async scaffold(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Scaffolding with create-next-app...");
    const parentDir = path.dirname(targetDir);
    const name = path.basename(targetDir);
    // Delegating to the official generator instead of hand-writing app files
    // means the project always starts from Next.js's own current best
    // practices, instead of drifting from upstream over time. --skip-install
    // and --disable-git defer to acli's own dependency-install and git-init
    // steps later in the create flow, so neither step runs twice.
    await this.run("npx", [
      "create-next-app@latest", name,
      "--ts", "--eslint", "--app", "--src-dir",
      "--import-alias", "@/*",
      "--use-npm", "--skip-install", "--disable-git", "--yes",
    ], { cwd: parentDir });
  }
}
