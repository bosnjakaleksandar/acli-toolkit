import test from "node:test";
import assert from "node:assert/strict";
import { databaseCommand, resolveRemoteProfile } from "../src/services/RemoteProfileService.ts";
import { runCommand } from "../src/utils/commandRunner.ts";

/**
 * Regression coverage for phase 1e: the `direct` database driver used to
 * embed the DB password directly in the command string handed to `ssh`,
 * which is visible in that ssh child process's own argv on *this* machine
 * (via `ps`/`ps aux`) for as long as the export runs. The password now
 * travels over the ssh channel's stdin, read by the remote script's
 * `read -r` before the dump command executes.
 */

const baseProfile = {
  ssh: { host: "db.example.com", username: "deploy" },
  remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" },
  files: { transport: "rsync" as const },
  urls: { staging: "https://demo.example.com" },
};

test("the direct driver's command string never contains the password, regardless of special characters in it", () => {
  // No "{...}" segments here — resolveRemoteProfile runs every profile
  // string field through its own {placeholder} template substitution first
  // (unrelated to this test), so a literal "{...}" in the password would be
  // rejected at that earlier layer rather than reaching databaseCommand.
  const weirdPassword = `p'"a$ss w/ord;rm -rf ~`;
  const resolved = resolveRemoteProfile({ ...baseProfile, database: { driver: "direct", host: "db.example.com", port: 3306, user: "dbuser", password: weirdPassword, name: "wp" } }, { projectName: "demo" });
  const { command, stdin } = databaseCommand(resolved);
  assert.doesNotMatch(command, /p'"a/, "no fragment of the password may appear in the command string (this becomes local ssh argv, and the remote sh -c argument)");
  assert.equal(stdin, `${weirdPassword}\n`);
});

test("databaseCommand rejects a password containing a literal newline (read -r can only deliver one line)", () => {
  const resolved = resolveRemoteProfile({ ...baseProfile, database: { driver: "direct", host: "db.example.com", port: 3306, user: "dbuser", password: "line1\nline2", name: "wp" } }, { projectName: "demo" });
  assert.throws(() => databaseCommand(resolved), /cannot contain a newline/);
});

test("wp-cli and docker drivers are unaffected — no stdin field, command shape unchanged", () => {
  const wpCli = resolveRemoteProfile({ ...baseProfile, database: { driver: "wp-cli" } }, { projectName: "demo" });
  const { command, stdin } = databaseCommand(wpCli);
  assert.equal(stdin, undefined);
  assert.match(command, /wp db export/);
});

test("end-to-end (real subprocess): the stdin-delivered password reaches the remote script's MYSQL_PWD env var intact, including shell metacharacters", async () => {
  const password = `s3cr3t with spaces $and'quotes`;
  const resolved = resolveRemoteProfile({ ...baseProfile, database: { driver: "direct", host: "db.example.com", port: 3306, user: "dbuser", password, name: "wp" } }, { projectName: "demo" });
  const { command, stdin } = databaseCommand(resolved);

  // Simulate exactly what sshd does with ssh's trailing command argument:
  // run it via `sh -c "<command>"`. Swap the real dump executable for
  // something that reports what env it actually received, without needing a
  // real mysqldump/mariadb-dump binary in the test environment.
  const simulated = command.replace(/mysqldump .*/, "env | grep ^MYSQL_PWD=");
  const output = (await runCommand("sh", ["-c", simulated], { encoding: "utf8", stdin })) as string;

  assert.equal(output, `MYSQL_PWD=${password}`);
});
