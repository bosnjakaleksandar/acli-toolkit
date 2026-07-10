import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  ACA_DIMENSIONS,
  ACA_STATES,
  AcaCharacter,
} from "../src/ui/acaCharacter.js";

const EXPECTED_STATES = [
  "startup", "idle", "thinking", "working", "success",
  "warning", "error", "cancelled", "offline",
];

function createOutput({ isTTY = true } = {}) {
  let contents = "";
  return {
    isTTY,
    columns: 80,
    write(chunk) {
      contents += chunk;
      return true;
    },
    read: () => contents,
  };
}

test("all operational states exist and use identical frame dimensions", () => {
  assert.deepEqual(Object.keys(ACA_STATES), EXPECTED_STATES);
  for (const state of EXPECTED_STATES) {
    assert.ok(ACA_STATES[state].length >= 1, `${state} has frames`);
    for (const frame of ACA_STATES[state]) {
      assert.equal(frame.length, ACA_DIMENSIONS.height, `${state} frame height`);
      for (const line of frame) assert.equal(line.length, ACA_DIMENSIONS.width, `${state} frame width`);
    }
  }
});

test("state transitions clear the previous timer and stop clears all animation", () => {
  const character = new AcaCharacter({ stdout: createOutput(), env: {}, manageProcess: false });
  character.setState("working", "First operation");
  const firstTimer = character.timer;
  assert.equal(character.hasActiveAnimation(), true);

  character.setState("thinking", "Second operation");
  assert.notEqual(character.timer, firstTimer);
  assert.equal(firstTimer._destroyed, true);

  character.stop();
  assert.equal(character.hasActiveAnimation(), false);
});

test("terminal cursor is restored after a completed state", async () => {
  const stdout = createOutput();
  const character = new AcaCharacter({ stdout, env: {}, manageProcess: false });
  await character.play("success", "Done");
  assert.match(stdout.read(), /\x1B\[\?25l/);
  assert.match(stdout.read(), /\x1B\[\?25h/);
  assert.equal(character.hasActiveAnimation(), false);
});

test("non-TTY and reduced-motion modes render one static frame", async () => {
  const nonTtyOutput = createOutput({ isTTY: false });
  const nonTty = new AcaCharacter({ stdout: nonTtyOutput, env: {}, manageProcess: false });
  await nonTty.play("working", "Static output");
  assert.doesNotMatch(nonTtyOutput.read(), /\x1B\[/);
  assert.equal(nonTty.hasActiveAnimation(), false);

  const reducedOutput = createOutput();
  const reduced = new AcaCharacter({
    stdout: reducedOutput,
    env: { ACLI_REDUCED_MOTION: "1" },
    manageProcess: false,
  });
  await reduced.play("thinking", "Reduced motion");
  assert.doesNotMatch(reducedOutput.read(), /\x1B\[\?25l/);
  assert.equal(reduced.hasActiveAnimation(), false);
});

test("NO_COLOR suppresses semantic state colors", async () => {
  const stdout = createOutput();
  const character = new AcaCharacter({
    stdout,
    env: { NO_COLOR: "", ACLI_REDUCED_MOTION: "1" },
    manageProcess: false,
  });
  await character.play("error", "No color");
  assert.doesNotMatch(stdout.read(), /\x1B\[(?:31|32|33|36|38;5;\d+)m/);
});

test("SIGINT and cancellation clean timers and restore the cursor", async () => {
  const processRef = new EventEmitter();
  processRef.pid = 123;
  const stdout = createOutput();
  const character = new AcaCharacter({ stdout, env: {}, processRef });
  character.setState("working", "Interruptible");
  processRef.emit("SIGINT");
  assert.equal(character.hasActiveAnimation(), false);
  assert.equal(processRef.exitCode, 130);
  assert.match(stdout.read(), /\x1B\[\?25h/);

  const cancelled = new AcaCharacter({ stdout: createOutput(), env: {}, manageProcess: false });
  await cancelled.play("cancelled", "Operation cancelled.");
  assert.equal(cancelled.hasActiveAnimation(), false);
});
