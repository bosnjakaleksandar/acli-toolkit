// Contributor-only fast loop: runs the CLI directly from src/ via Node's
// native TypeScript stripping, with no build step. `bin/acli` (what actually
// ships and what `npm link` points at) always runs from dist/ instead.
import os from "node:os";

let recoveredDirectory = false;
try { process.cwd(); } catch {
  process.chdir(os.homedir());
  recoveredDirectory = true;
}

try {
  const { run } = await import("../src/cli/run.js");
  if (recoveredDirectory) console.warn(`Warning: the previous working directory no longer exists or is inaccessible. Continuing from ${process.cwd()}.`);
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
