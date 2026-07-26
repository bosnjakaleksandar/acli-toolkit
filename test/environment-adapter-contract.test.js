import test from "node:test";
import assert from "node:assert/strict";
import DockerComposeService from "../src/environments/DockerEnvironment.ts";
import LandoService from "../src/environments/LandoEnvironment.ts";

// Parity gate: every environment adapter must implement the full contract
// with a working command shape, so a method added to one adapter and
// forgotten in the other is caught here instead of surfacing as a runtime
// gap for whichever local environment wasn't exercised in manual testing.
const CONTRACT_METHODS = ["getLocalUrl", "scaffold", "start", "isDbReady", "waitForDb", "isAppDbReady", "waitForAppDb", "ensureWpCli", "importDb", "recoverDb", "wp", "searchReplace"];

const adapters = [
  { name: "docker", Adapter: DockerComposeService },
  { name: "lando", Adapter: LandoService },
];

function alwaysSucceedRunner() {
  return async () => "";
}

for (const { name, Adapter } of adapters) {
  test(`${name} adapter implements every contract method`, () => {
    const adapter = new Adapter({ runner: alwaysSucceedRunner() });
    for (const method of CONTRACT_METHODS) {
      assert.equal(typeof adapter[method], "function", `${name} adapter is missing ${method}()`);
    }
  });

  test(`${name} adapter accepts an injected runner and never calls the real command runner`, async () => {
    const calls = [];
    const adapter = new Adapter({ runner: async (command, args) => { calls.push({ command, args }); return ""; } });
    await adapter.start("/project", null);
    assert.ok(calls.length > 0, "start() should invoke the injected runner");
    assert.equal(calls[0].command, name === "docker" ? "docker" : "lando");
  });

  test(`${name} adapter's wp() runs a wp-cli argv and searchReplace delegates to it with --all-tables`, async () => {
    const calls = [];
    const adapter = new Adapter({ runner: async (command, args) => { calls.push(args); return ""; } });
    await adapter.searchReplace("/project", "https://old.example.com", "http://localhost", null);
    const wpCall = calls.find((args) => args.includes("search-replace"));
    assert.ok(wpCall, `${name} searchReplace should route through wp()`);
    assert.ok(wpCall.includes("--all-tables"), `${name} searchReplace should pass --all-tables`);
  });

  test(`${name} adapter's waitForDb throws a DB_NOT_READY CliError on timeout instead of proceeding`, async () => {
    const adapter = new Adapter({ runner: async () => { throw new Error("not ready"); } });
    await assert.rejects(
      () => adapter.waitForDb("/project", { timeoutSeconds: 0 }, null),
      (error) => {
        assert.equal(error.code, "DB_NOT_READY");
        return true;
      },
    );
  });

  test(`${name} adapter's waitForAppDb throws an APP_DB_NOT_READY CliError on timeout instead of proceeding`, async () => {
    const adapter = new Adapter({ runner: async () => { throw new Error("not reachable"); } });
    await assert.rejects(
      () => adapter.waitForAppDb("/project", { timeoutSeconds: 0 }, null),
      (error) => {
        assert.equal(error.code, "APP_DB_NOT_READY");
        return true;
      },
    );
  });

  test(`${name} adapter's importDb never issues the SQL import before the app-path DB probe succeeds (the startup-race regression)`, async () => {
    // isDbReady (root/socket, inside the db container) can report ready
    // before isAppDbReady (TCP, app credentials, from the app container) —
    // that gap is exactly the race that let imports run against a database
    // WordPress itself couldn't yet reach. This proves import always probes
    // the app path first (and does so successfully) before importing.
    const isProbeCommand = name === "docker"
      ? (args) => args.includes("wordpress") && args.includes("php") && args.join(" ").includes("mysqli_connect")
      : (args) => args[0] === "ssh" && args.includes("appserver") && args.join(" ").includes("mysqli_connect");
    const isImportCommand = name === "docker"
      ? (args) => args.join(" ").includes("defaults-file=/tmp/my.cnf")
      : (args) => args[0] === "db-import";

    const calls = [];
    const adapter = new Adapter({
      runner: async (command, args = []) => {
        calls.push({ op: isProbeCommand(args) ? "probe" : isImportCommand(args) ? "import" : "other", args });
        return "";
      },
    });

    await adapter.importDb("/project", "staging.sql", null);

    const probeCalls = calls.filter((call) => call.op === "probe");
    assert.ok(probeCalls.length >= 1, `${name} importDb should probe the app-path DB connection`);
    const firstImportIndex = calls.findIndex((call) => call.op === "import");
    const firstProbeIndex = calls.findIndex((call) => call.op === "probe");
    assert.ok(firstImportIndex > firstProbeIndex, "import must not run before the app-path probe");
  });

  test(`${name} adapter's waitForAppDb retries until the app-path probe succeeds, without a fixed real-time delay in tests`, async () => {
    let probeFailures = 2;
    const isProbeCommand = name === "docker"
      ? (args) => args.includes("wordpress") && args.includes("php")
      : (args) => args[0] === "ssh" && args.includes("appserver");
    let probeAttempts = 0;
    const adapter = new Adapter({
      runner: async (command, args = []) => {
        if (isProbeCommand(args)) {
          probeAttempts += 1;
          if (probeFailures > 0) { probeFailures -= 1; throw new Error("connection refused"); }
        }
        return "";
      },
    });

    // pollIntervalMs is injected small so this resolves near-instantly instead
    // of waiting out the real 2s default between retries.
    await adapter.waitForAppDb("/project", { timeoutSeconds: 5, pollIntervalMs: 1 }, null);
    assert.equal(probeAttempts, 3, "should fail twice, then succeed, before resolving");
  });

  test(`${name} adapter's importDb recovers exactly once from a stale-credentials failure`, async () => {
    let importAttempts = 0;
    const isImportCommand = name === "docker"
      ? (args) => args.join(" ").includes("defaults-file=/tmp/my.cnf")
      : (args) => args[0] === "db-import";
    const recoveryCommand = name === "docker" ? "compose down --volumes --remove-orphans" : "rebuild -y";
    const calls = [];
    const adapter = new Adapter({
      runner: async (command, args = []) => {
        calls.push(args.join(" "));
        if (isImportCommand(args)) {
          importAttempts += 1;
          if (importAttempts === 1) {
            const { CommandError } = await import("../src/system/commandRunner.ts");
            throw new CommandError(command, args, { status: 1, stdout: "", stderr: "ERROR 1045 (28000): Access denied" });
          }
        }
        return "";
      },
    });
    await adapter.importDb("/project", "staging.sql", null);
    assert.equal(importAttempts, 2);
    assert.ok(calls.includes(recoveryCommand), `${name} recovery should run \`${recoveryCommand}\``);
  });
}
