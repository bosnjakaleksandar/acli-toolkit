import test from "node:test";
import assert from "node:assert/strict";
import { splitCommand } from "../src/config/references.ts";

// splitCommand parses the string in a secret provider's `{ command: "..." }`
// reference into an argv array for execFileSync. It has no dedicated tests
// today despite being hand-rolled (not a library) — these pin its actual
// current behavior, including the sharp edges, so a future change to it is
// deliberate rather than accidental.

test("splitCommand splits on whitespace outside of quotes", () => {
  assert.deepEqual(splitCommand("op read op://vault/item/password"), ["op", "read", "op://vault/item/password"]);
});

test("splitCommand keeps a double-quoted argument (including spaces) as one token and strips the quotes", () => {
  assert.deepEqual(splitCommand('echo "hello world"'), ["echo", "hello world"]);
});

test("splitCommand keeps a single-quoted argument as one token and strips the quotes", () => {
  assert.deepEqual(splitCommand("echo 'single quoted'"), ["echo", "single quoted"]);
});

test("splitCommand preserves an embedded single quote inside a double-quoted token", () => {
  assert.deepEqual(splitCommand("echo \"it's a test\""), ["echo", "it's a test"]);
});

test("splitCommand does not interpret backslash as an escape character — a backslash before a space still splits there", () => {
  assert.deepEqual(splitCommand("echo foo\\ bar"), ["echo", "foo\\", "bar"]);
});

test("splitCommand silently drops an unterminated quote character rather than throwing", () => {
  // Documents current behavior: the lone `"` is dropped, not treated as a
  // parse error and not treated as the start of an unterminated token.
  assert.deepEqual(splitCommand('echo "unterminated'), ["echo", "unterminated"]);
});

test("splitCommand returns an empty array for an empty or whitespace-only string", () => {
  assert.deepEqual(splitCommand(""), []);
  assert.deepEqual(splitCommand("   "), []);
});
