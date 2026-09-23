import test from "node:test";
import assert from "node:assert/strict";
import { localRequirements, runLocalPreflight } from "../src/system/preflight.ts";

test("each plan requires exactly the tools it uses", () => {
  assert.deepEqual(localRequirements({ appType: "application", environment: "none" }), ["npm", "git"]);
  assert.deepEqual(localRequirements({ appType: "application", environment: "docker" }), ["npm", "docker", "git"]);
  assert.deepEqual(localRequirements({ appType: "application", environment: "lando", useLaravel: true }), ["npm", "lando", "git", "composer", "php"]);
  assert.deepEqual(localRequirements({ appType: "wordpress", environment: "docker" }), ["docker", "git"]);
  assert.deepEqual(localRequirements({ appType: "wordpress", environment: "lando", skipGitInit: true }), ["lando"]);
});

test("preflight passes when the required tools are present", async () => {
  // A natively-run app needs only npm (git skipped), which the test machine has.
  const result = await runLocalPreflight({ appType: "application", environment: "none", skipGitInit: true });
  assert.deepEqual(result, { warnings: [] });
});

test("preflight warns instead of failing when the dev-server port is busy", async () => {
  const server = (await import("node:net")).createServer();
  await new Promise((resolve) => server.listen(3999, "127.0.0.1", resolve));
  try {
    const result = await runLocalPreflight({ appType: "application", environment: "none", skipGitInit: true, projectType: "react", port: 3999 });
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Port 3999/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
