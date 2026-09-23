import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import NextjsStrategy from "../src/projects/strategies/NextjsStrategy.ts";
import ReactStrategy from "../src/projects/strategies/ReactStrategy.ts";
import LaravelStrategy from "../src/projects/strategies/LaravelStrategy.ts";

/** A throwaway parent folder: the strategies write .gitignore into <parent>/my-app. */
async function workDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "acli-strategy-"));
}

function makeFakeRunner() {
  const calls = [];
  const runner = async (command, args, options) => { calls.push({ command, args, options }); return ""; };
  return { runner, calls };
}

test("NextjsStrategy delegates to create-next-app with the project directory as an argument, cwd set to the parent", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new NextjsStrategy(null, { runner });
  const work = await workDir();
  await strategy.scaffold(path.join(work, "my-app"), { projectName: "my-app" }, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npx");
  assert.equal(calls[0].args[0], "create-next-app@latest");
  assert.equal(calls[0].args[1], "my-app");
  assert.equal(calls[0].options.cwd, work);
});

test("NextjsStrategy passes --skip-install and --disable-git so acli's own install/git steps run exactly once", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new NextjsStrategy(null, { runner });
  await strategy.scaffold(path.join(await workDir(), "my-app"), { projectName: "my-app" }, null);

  assert.ok(calls[0].args.includes("--skip-install"));
  assert.ok(calls[0].args.includes("--disable-git"));
  assert.ok(calls[0].args.includes("--yes"), "should force non-interactive defaults for any unspecified option");
});

test("ReactStrategy delegates to create-vite (via npm create) with the project directory as an argument", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new ReactStrategy(null, { runner });
  const work = await workDir();
  await strategy.scaffold(path.join(work, "my-app"), { projectName: "my-app" }, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm");
  assert.deepEqual(calls[0].args.slice(0, 3), ["create", "vite@latest", "my-app"]);
  assert.ok(calls[0].args.includes("--template"));
  assert.ok(calls[0].args.includes("react"));
  assert.equal(calls[0].options.cwd, work);
});

test("ReactStrategy passes --no-immediate and --no-interactive so it never installs/starts a dev server or blocks on a prompt", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new ReactStrategy(null, { runner });
  await strategy.scaffold(path.join(await workDir(), "my-app"), { projectName: "my-app" }, null);

  assert.ok(calls[0].args.includes("--no-immediate"));
  assert.ok(calls[0].args.includes("--no-interactive"));
});

test("LaravelStrategy scaffolds the frontend via the wrapped strategy, then delegates the backend to composer create-project", async () => {
  const { runner, calls } = makeFakeRunner();
  const frontendCalls = [];
  const fakeFrontend = { scaffold: async (dir, ctx) => { frontendCalls.push({ dir, ctx }); } };
  // hasCommand is injected (not just `runner`) so this test never depends on
  // whether Composer is actually installed on the machine running it — it
  // previously did, which passed by coincidence on machines/runners that
  // happen to have Composer (e.g. GitHub's ubuntu-latest) and failed on ones
  // that don't (macos-latest).
  const strategy = new LaravelStrategy(null, fakeFrontend, { runner, hasCommand: () => true });

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-laravel-strategy-"));

  await strategy.scaffold(directory, { projectName: "demo", framework: "react" });

  assert.equal(frontendCalls.length, 1);
  assert.equal(frontendCalls[0].dir, path.join(directory, "frontend"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "composer");
  assert.deepEqual(calls[0].args, ["create-project", "laravel/laravel", "backend"]);
  assert.equal(calls[0].options.cwd, directory);

  assert.ok(await fs.pathExists(path.join(directory, "README.md")));
  assert.ok(await fs.pathExists(path.join(directory, ".gitignore")));
  await fs.remove(directory);
});

test("React and Next.js use A-CLI's .gitignore and keep the generator's extra rules", async () => {
  for (const [Strategy, generatorRule, typeRule] of [[ReactStrategy, "dist", "coverage/"], [NextjsStrategy, "/.next/", ".vercel/"]]) {
    const work = await workDir();
    const target = path.join(work, "my-app");
    // The fake generator writes its own .gitignore, like create-vite / create-next-app do.
    const runner = async () => { await fs.outputFile(path.join(target, ".gitignore"), `node_modules\n${generatorRule}\n/generator-only/\n`); return ""; };
    await new Strategy(null, { runner }).scaffold(target, { projectName: "my-app" }, null);

    const gitignore = await fs.readFile(path.join(target, ".gitignore"), "utf8");
    assert.ok(gitignore.startsWith("# .gitignore generated by A-CLI"), "A-CLI's template comes first");
    assert.match(gitignore, /# Kept from the project's previous \.gitignore\n(.+\n)*\/generator-only\/\n$/);
    assert.match(gitignore, /^\.acli\/$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, new RegExp(`^${typeRule.replace(".", "\\.")}$`, "m"));
    await fs.remove(work);
  }
});
