import path from "node:path";
import BaseStrategy from "./BaseStrategy.js";
import { runCommand } from "../utils/commandRunner.js";

export default class NextjsStrategy extends BaseStrategy {
  constructor(envService, { runner = runCommand } = {}) {
    super(envService);
    this.run = runner;
  }

  async scaffold(targetDir, ctx, spinner = null) {
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
