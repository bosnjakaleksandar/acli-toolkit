import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { detectPackageManager, runScriptCommand } from "../src/services/PackageManagerService.ts";

test("package manager follows the nearest lockfile", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "acli-pm-"));
  await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");
  const manager = await detectPackageManager(path.join(cwd, "nested"));
  assert.equal(manager.name, "pnpm");
  assert.equal(runScriptCommand(manager, "dev"), "pnpm run dev");
  await fs.remove(cwd);
});
