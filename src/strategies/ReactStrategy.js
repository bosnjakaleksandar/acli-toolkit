import path from "node:path";
import BaseStrategy from "./BaseStrategy.js";
import { runCommand } from "../utils/commandRunner.js";

export default class ReactStrategy extends BaseStrategy {
  constructor(envService, { runner = runCommand } = {}) {
    super(envService);
    this.run = runner;
  }

  async scaffold(targetDir, ctx, spinner = null) {
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
