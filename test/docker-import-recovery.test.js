import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import DockerComposeService from "../src/environments/DockerEnvironment.ts";
import { CommandError } from "../src/system/commandRunner.ts";

function isImportCommand(args) {
  return args.join(" ").includes("defaults-file=/tmp/my.cnf");
}

function makeFakeRunner({ importFailures = 0 } = {}) {
  const calls = [];
  let importAttempts = 0;
  const runner = async (command, args = [], options = {}) => {
    calls.push({ command, args });
    if (isImportCommand(args)) {
      importAttempts += 1;
      if (importAttempts <= importFailures) {
        throw new CommandError("docker", args, { status: 1, stdout: "", stderr: "ERROR 1045 (28000): Access denied for user 'root'@'localhost'" });
      }
    }
    return "";
  };
  return { runner, calls, importAttemptsRef: () => importAttempts };
}

test("importDb succeeds on the first try when credentials are valid", async () => {
  const { runner, calls } = makeFakeRunner({ importFailures: 0 });
  const docker = new DockerComposeService({ runner });
  await docker.importDb("/project", "staging.sql", null);

  assert.equal(calls.filter((call) => isImportCommand(call.args)).length, 1);
  assert.equal(calls.some((call) => call.args.join(" ") === "compose down --volumes --remove-orphans"), false);
});

test("importDb recovers once from a stale-credentials error by rebuilding the DB volume and retrying", async () => {
  const { runner, calls } = makeFakeRunner({ importFailures: 1 });
  const docker = new DockerComposeService({ runner });
  await docker.importDb("/project", "staging.sql", null);

  const importCalls = calls.filter((call) => isImportCommand(call.args));
  assert.equal(importCalls.length, 2, "import should be attempted, fail once, then retried after recovery");

  const recoveryIndex = calls.findIndex((call) => call.args.join(" ") === "compose down --volumes --remove-orphans");
  assert.notEqual(recoveryIndex, -1, "recovery must run `docker compose down --volumes --remove-orphans`");
  assert.ok(recoveryIndex > calls.indexOf(importCalls[0]), "recovery must run after the first failed import");
  assert.ok(calls.some((call) => call.command === "docker" && call.args.join(" ") === "compose up -d"), "recovery must restart the stack before retrying");
});

test("importDb only retries once: a second stale-credentials failure propagates", async () => {
  const { runner } = makeFakeRunner({ importFailures: 2 });
  const docker = new DockerComposeService({ runner });
  await assert.rejects(() => docker.importDb("/project", "staging.sql", null), (error) => {
    assert.match(error.stderr, /Access denied/);
    return true;
  });
});

test("importDb does not attempt recovery for an unrelated error", async () => {
  const runner = async (command, args = []) => {
    if (isImportCommand(args)) throw new CommandError("docker", args, { status: 2, stdout: "", stderr: "ERROR 2002: Can't connect to server" });
    return "";
  };
  const docker = new DockerComposeService({ runner });
  await assert.rejects(() => docker.importDb("/project", "staging.sql", null), (error) => {
    assert.match(error.stderr, /Can't connect to server/);
    return true;
  });
});

test("waitForDb throws instead of proceeding once the timeout elapses", async () => {
  const runner = async (command, args = []) => {
    if (args.includes("db") && args.join(" ").includes("SELECT 1")) throw new Error("connection refused");
    return "";
  };
  const docker = new DockerComposeService({ runner });
  await assert.rejects(
    () => docker.waitForDb("/project", { timeoutSeconds: 0 }, null),
    (error) => {
      assert.equal(error.code, "DB_NOT_READY");
      return true;
    },
  );
});

test("regression: recovers when the raw SQL import succeeds (root creds) but WordPress's own DB connection fails (stale app-user creds in an old volume)", async () => {
  // Reproduces a real-world case: a db_data volume created by an earlier
  // run keeps its original app-user password even after the compose
  // template's credentials change. The direct SQL import authenticates as
  // root and succeeds regardless, so the failure only shows up once wp-cli
  // (via wp-config.php, using the app user) tries to connect.
  //
  // This also models wp-cli's own install state: `compose down` destroys
  // the wordpress container's filesystem, where ensureWpCli() curl-installs
  // the wp binary — so after recovery, wp-cli is gone until reinstalled. A
  // fake runner that always answers "wp" commands successfully would not
  // have caught the real bug (recovery forgetting to reinstall it), so this
  // one tracks install state explicitly and fails "wp ..." calls otherwise.
  const calls = [];
  let verifyAttempts = 0;
  let wpCliInstalled = false;
  const isWpCliInstallCommand = (args) => args.join(" ").includes("install -m 0755") && args.join(" ").includes("/usr/local/bin/wp");
  const isWpCommand = (args) => args.join(" ").includes("wordpress wp "); // this.wp() always runs "... wordpress wp <subcommand...>"
  const runner = async (command, args = []) => {
    calls.push(args.join(" "));
    if (args.join(" ") === "compose down --volumes --remove-orphans") { wpCliInstalled = false; return ""; }
    if (isWpCliInstallCommand(args)) { wpCliInstalled = true; return ""; }
    if (isImportCommand(args)) return ""; // root-authenticated import always succeeds
    if (isWpCommand(args)) {
      if (!wpCliInstalled) throw new CommandError("docker", args, { status: 127, stdout: "", stderr: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "wp": executable file not found in $PATH' });
      if (args.join(" ").includes("option get siteurl --debug")) {
        verifyAttempts += 1;
        if (verifyAttempts === 1) throw new CommandError("docker", args, { status: 1, stdout: "", stderr: "Error: Error establishing a database connection." });
      }
    }
    return "";
  };
  const docker = new DockerComposeService({ runner });
  await docker.importDb("/project", "staging.sql", null);

  assert.equal(verifyAttempts, 2, "the connection check should be retried once after recovery");
  assert.ok(calls.includes("compose down --volumes --remove-orphans"), "recovery must rebuild the DB volume");
  const importCalls = calls.filter((call) => call.includes("defaults-file=/tmp/my.cnf"));
  assert.equal(importCalls.length, 2, "the import itself is redone after recovery, not just the connection check");
  const installCalls = calls.filter((call) => call.includes("install -m 0755") && call.includes("/usr/local/bin/wp"));
  assert.equal(installCalls.length, 2, "wp-cli must be reinstalled after recovery recreates the container, not just once up front");
});

test("regression: recovery preserves a customized wp-config.php and keeps a protected backup", async () => {
  // wp-config.php is only ever auto-generated by the WordPress image's
  // entrypoint if one doesn't already exist. Because it lives on the
  // bind-mounted project directory (not a named volume), `docker compose
  // down --volumes` never removes it — so a copy left over from an earlier
  // attempt (e.g. one that predates a credentials change) would silently
  // keep stale values no matter how many times the database itself gets
  // wiped, unless recovery explicitly deletes it too.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-recover-wpconfig-"));
  const original = "<?php\ndefine('DB_PASSWORD', 'stale-value');\ndefine('CUSTOM_SETTING', true);\n";
  await fs.writeFile(path.join(directory, "wp-config.php"), original);

  const runner = async () => "";
  const docker = new DockerComposeService({ runner });
  await docker.recoverDb(directory, null);

  assert.equal(await fs.readFile(path.join(directory, "wp-config.php"), "utf8"), original);
  assert.equal(await fs.readFile(path.join(directory, ".acli", "recovery", "wp-config.php.before-db-recovery"), "utf8"), original);
  await fs.remove(directory);
});

test("recoverDb probes the app-path DB connection after restarting the stack, before reinstalling wp-cli", async () => {
  // Recovery restarts the whole stack, which re-opens the exact same
  // startup-race window that isAppDbReady exists to close. Without probing
  // again here, the retry that follows recovery would race the same window
  // that caused the original failure.
  const calls = [];
  const isProbeCommand = (args) => args.includes("wordpress") && args.includes("php") && args.join(" ").includes("mysqli_connect");
  const runner = async (command, args = []) => {
    calls.push(isProbeCommand(args) ? "probe" : args.join(" "));
    return "";
  };
  const docker = new DockerComposeService({ runner });
  await docker.recoverDb("/project", null);

  const probeIndex = calls.indexOf("probe");
  assert.notEqual(probeIndex, -1, "recoverDb must probe the app-path DB connection");
  const restartIndex = calls.indexOf("compose up -d");
  const installIndex = calls.findIndex((call) => call.includes("install -m 0755") && call.includes("/usr/local/bin/wp"));
  assert.ok(restartIndex < probeIndex, "probe must happen after the stack restarts");
  assert.ok(probeIndex < installIndex, "probe must happen before wp-cli is reinstalled");
});

test("searchReplace runs wp search-replace with --all-tables", async () => {
  const { runner, calls } = makeFakeRunner();
  const docker = new DockerComposeService({ runner });
  await docker.searchReplace("/project", "https://old.example.com", "http://localhost:8080", null);

  const wpCall = calls.find((call) => call.args.includes("search-replace"));
  assert.ok(wpCall, "expected a wp search-replace invocation");
  assert.deepEqual(wpCall.args.slice(wpCall.args.indexOf("wp")), ["wp", "--skip-plugins", "--skip-themes", "search-replace", "https://old.example.com", "http://localhost:8080", "--all-tables"]);
});

test("regression: the post-import connection check must not depend on the mysql/mysqlcheck/mysqldump client binaries", async () => {
  // `wp db check`/`db export`/`db import` shell out to the mysql client
  // binaries (mysqlcheck, mysqldump, ...), which the official `wordpress`
  // Docker image does not include — only PHP's mysqli extension. A check
  // built on those commands fails with "command not found" regardless of
  // whether the actual DB connection is fine, which is strictly worse than
  // not checking at all. The connection check must stick to commands that
  // go through $wpdb (e.g. `option get`), which never shells out.
  const { runner, calls } = makeFakeRunner();
  const docker = new DockerComposeService({ runner });
  await docker.importDb("/project", "staging.sql", null);

  const wpCalls = calls.filter((call) => call.args.includes("wp"));
  const shellsOutToMysqlBinaries = wpCalls.some((call) => call.args.includes("db"));
  assert.equal(shellsOutToMysqlBinaries, false, `connection check must not use a "wp db ..." subcommand: ${JSON.stringify(wpCalls)}`);
});
