import test from "node:test";
import assert from "node:assert/strict";
import { runLocalPreflight } from "../src/services/PreflightService.js";
import { CliError } from "../src/utils/CliError.js";

test("preflight passes when the required tool is present", async () => {
  // "git" stands in for the environment tool here: it is virtually always
  // present, so this exercises the aggregation/success path without depending
  // on docker or lando being installed on the machine running the tests.
  const result = await runLocalPreflight({ environment: "git", skipGitInit: true, skipGitLink: true });
  assert.deepEqual(result, { warnings: [] });
});

test("preflight throws a CliError naming every missing tool", async () => {
  await assert.rejects(
    () => runLocalPreflight({ environment: "definitely-not-a-real-tool", skipGitInit: true, skipGitLink: true }),
    (error) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, "PREFLIGHT_FAILED");
      assert.match(error.message, /definitely-not-a-real-tool/);
      return true;
    },
  );
});

test("preflight warns instead of failing when the dev-server port is busy", async () => {
  const server = (await import("node:net")).createServer();
  await new Promise((resolve) => server.listen(3999, "127.0.0.1", resolve));
  try {
    const result = await runLocalPreflight({ environment: "git", skipGitInit: true, skipGitLink: true, projectType: "react", port: 3999 });
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Port 3999/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
