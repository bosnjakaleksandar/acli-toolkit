import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import LandoService from "../src/environments/LandoEnvironment.ts";
import { CommandError } from "../src/system/commandRunner.ts";

function isImportCommand(args) {
  return args[0] === "db-import";
}

function makeFakeRunner({ importFailures = 0 } = {}) {
  const calls = [];
  let importAttempts = 0;
  const runner = async (command, args = []) => {
    calls.push({ command, args });
    if (isImportCommand(args)) {
      importAttempts += 1;
      if (importAttempts <= importFailures) {
        throw new CommandError("lando", args, { status: 1, stdout: "", stderr: "ERROR 1045 (28000): Access denied for user 'wordpress'@'%'" });
      }
    }
    return "";
  };
  return { runner, calls };
}

test("importDb succeeds on the first try when credentials are valid", async () => {
  const { runner, calls } = makeFakeRunner({ importFailures: 0 });
  const lando = new LandoService({ runner });
  await lando.importDb("/project", "staging.sql", null);

  assert.equal(calls.filter((call) => isImportCommand(call.args)).length, 1);
  assert.equal(calls.some((call) => call.args[0] === "rebuild"), false);
});

test("importDb recovers once from a stale-credentials error by rebuilding the Lando app and retrying", async () => {
  const { runner, calls } = makeFakeRunner({ importFailures: 1 });
  const lando = new LandoService({ runner });
  await lando.importDb("/project", "staging.sql", null);

  const importCalls = calls.filter((call) => isImportCommand(call.args));
  assert.equal(importCalls.length, 2, "import should be attempted, fail once, then retried after recovery");

  const recoveryIndex = calls.findIndex((call) => call.args.join(" ") === "rebuild -y");
  assert.notEqual(recoveryIndex, -1, "recovery must run `lando rebuild -y`, mirroring Docker's volume rebuild");
  assert.ok(recoveryIndex > calls.indexOf(importCalls[0]), "recovery must run after the first failed import");
});

test("importDb only retries once: a second stale-credentials failure propagates", async () => {
  const { runner } = makeFakeRunner({ importFailures: 2 });
  const lando = new LandoService({ runner });
  await assert.rejects(() => lando.importDb("/project", "staging.sql", null), (error) => {
    assert.match(error.stderr, /Access denied/);
    return true;
  });
});

test("waitForDb throws instead of proceeding once the timeout elapses", async () => {
  const runner = async (command, args = []) => {
    if (args[0] === "mysql") throw new Error("connection refused");
    return "";
  };
  const lando = new LandoService({ runner });
  await assert.rejects(
    () => lando.waitForDb("/project", { timeoutSeconds: 0 }, null),
    (error) => {
      assert.equal(error.code, "DB_NOT_READY");
      return true;
    },
  );
});

test("ensureWpCli verifies via `lando wp --version` and throws a clear error when unavailable", async () => {
  const runner = async (command, args = []) => {
    if (args.join(" ") === "wp --skip-plugins --skip-themes --version") throw new Error("app not started");
    return "";
  };
  const lando = new LandoService({ runner });
  await assert.rejects(() => lando.ensureWpCli("/project", null), (error) => {
    assert.equal(error.code, "WP_CLI_INSTALL_FAILED");
    return true;
  });
});

test("regression: recovery preserves a customized wp-config.php and keeps a protected backup", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-lando-recover-wpconfig-"));
  const original = "<?php\ndefine('DB_PASSWORD', 'stale-value');\ndefine('CUSTOM_SETTING', true);\n";
  await fs.writeFile(path.join(directory, "wp-config.php"), original);

  const runner = async () => "";
  const lando = new LandoService({ runner });
  await lando.recoverDb(directory, null);

  assert.equal(await fs.readFile(path.join(directory, "wp-config.php"), "utf8"), original);
  assert.equal(await fs.readFile(path.join(directory, ".acli", "recovery", "wp-config.php.before-db-recovery"), "utf8"), original);
  await fs.remove(directory);
});

test("recoverDb probes the app-path DB connection after rebuilding, before verifying wp-cli", async () => {
  const calls = [];
  const isProbeCommand = (args) => args[0] === "ssh" && args.includes("appserver") && args.join(" ").includes("mysqli_connect");
  const runner = async (command, args = []) => {
    calls.push(isProbeCommand(args) ? "probe" : args.join(" "));
    return "";
  };
  const lando = new LandoService({ runner });
  await lando.recoverDb("/project", null);

  const probeIndex = calls.indexOf("probe");
  assert.notEqual(probeIndex, -1, "recoverDb must probe the app-path DB connection");
  const rebuildIndex = calls.indexOf("rebuild -y");
  const verifyIndex = calls.indexOf("wp --skip-plugins --skip-themes --version");
  assert.ok(rebuildIndex < probeIndex, "probe must happen after the app rebuilds");
  assert.ok(probeIndex < verifyIndex, "probe must happen before wp-cli is verified");
});

test("searchReplace runs wp search-replace with --all-tables", async () => {
  const { runner, calls } = makeFakeRunner();
  const lando = new LandoService({ runner });
  await lando.searchReplace("/project", "https://old.example.com", "https://app.lndo.site", null);

  const wpCall = calls.find((call) => call.args.includes("search-replace"));
  assert.ok(wpCall, "expected a wp search-replace invocation");
  assert.deepEqual(wpCall.args, ["wp", "--skip-plugins", "--skip-themes", "search-replace", "https://old.example.com", "https://app.lndo.site", "--all-tables"]);
});
