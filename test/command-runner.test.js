import test from "node:test";
import assert from "node:assert/strict";
import { CommandError, runCommandSync } from "../src/utils/commandRunner.ts";

test("CommandError redacts a mysqldump-style -p<password> argument from its message", () => {
  const error = new CommandError("ssh", ["-p", "22", "user@host", "mysqldump -h 'db' -p'hunter2' 'wp'"], { status: 1, stdout: "", stderr: "" });
  assert.doesNotMatch(error.message, /hunter2/);
  assert.match(error.message, /-p\[REDACTED\]/);
});

test("CommandError redacts a MYSQL_PWD=<password> prefix from its message", () => {
  const error = new CommandError("ssh", ["user@host", "MYSQL_PWD='hunter2' mysqldump -h 'db' -u 'root' 'wp'"], { status: 1, stdout: "", stderr: "" });
  assert.doesNotMatch(error.message, /hunter2/);
  assert.match(error.message, /MYSQL_PWD=\[REDACTED\]/);
});

test("CommandError leaves an unrelated -p <port> argument (space-separated, e.g. ssh's port flag) untouched", () => {
  const error = new CommandError("ssh", ["-p", "2222", "user@host", "true"], { status: 1, stdout: "", stderr: "" });
  assert.match(error.message, /-p 2222/);
});

test("runCommandSync never invokes a shell, even if the caller's options include shell: true", () => {
  // Under a real shell, "echo"'s single argv element containing ";" would be
  // split into two separate commands (printing two lines); passed straight
  // to execve() it's one literal argument printed verbatim on one line.
  const result = runCommandSync("echo", ["hello; echo INJECTED"], { shell: true });
  assert.equal(result.stdout.trim(), "hello; echo INJECTED");
});
