import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import NextjsStrategy from "../src/strategies/NextjsStrategy.ts";
import ReactStrategy from "../src/strategies/ReactStrategy.ts";
import LaravelStrategy from "../src/strategies/LaravelStrategy.ts";

function makeFakeRunner() {
  const calls = [];
  const runner = async (command, args, options) => { calls.push({ command, args, options }); return ""; };
  return { runner, calls };
}

test("NextjsStrategy delegates to create-next-app with the project directory as an argument, cwd set to the parent", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new NextjsStrategy(null, { runner });
  await strategy.scaffold("/work/my-app", { projectName: "my-app" }, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npx");
  assert.equal(calls[0].args[0], "create-next-app@latest");
  assert.equal(calls[0].args[1], "my-app");
  assert.equal(calls[0].options.cwd, "/work");
});

test("NextjsStrategy passes --skip-install and --disable-git so acli's own install/git steps run exactly once", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new NextjsStrategy(null, { runner });
  await strategy.scaffold("/work/my-app", { projectName: "my-app" }, null);

  assert.ok(calls[0].args.includes("--skip-install"));
  assert.ok(calls[0].args.includes("--disable-git"));
  assert.ok(calls[0].args.includes("--yes"), "should force non-interactive defaults for any unspecified option");
});

test("ReactStrategy delegates to create-vite (via npm create) with the project directory as an argument", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new ReactStrategy(null, { runner });
  await strategy.scaffold("/work/my-app", { projectName: "my-app" }, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm");
  assert.deepEqual(calls[0].args.slice(0, 3), ["create", "vite@latest", "my-app"]);
  assert.ok(calls[0].args.includes("--template"));
  assert.ok(calls[0].args.includes("react"));
  assert.equal(calls[0].options.cwd, "/work");
});

test("ReactStrategy passes --no-immediate and --no-interactive so it never installs/starts a dev server or blocks on a prompt", async () => {
  const { runner, calls } = makeFakeRunner();
  const strategy = new ReactStrategy(null, { runner });
  await strategy.scaffold("/work/my-app", { projectName: "my-app" }, null);

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

  const fs = (await import("fs-extra")).default;
  const os = (await import("node:os")).default;
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
