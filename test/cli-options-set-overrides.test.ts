import test from "node:test";
import assert from "node:assert/strict";
import { parseSetOverrides } from "../src/services/CliOptionsService.ts";

test("parseSetOverrides builds a nested object from dotted key=value pairs", () => {
  const result = parseSetOverrides(["database.host=localhost", "database.port=3306", "verbose=true"]);
  assert.deepEqual(result, { database: { host: "localhost", port: 3306 }, verbose: true });
});

test("parseSetOverrides rejects __proto__/constructor/prototype segments instead of polluting Object.prototype", () => {
  assert.throws(() => parseSetOverrides(["constructor.prototype.polluted=1"]), /Invalid --set key/);
  assert.throws(() => parseSetOverrides(["__proto__.polluted=1"]), /Invalid --set key/);
  assert.throws(() => parseSetOverrides(["a.prototype.polluted=1"]), /Invalid --set key/);
  assert.equal(({} as any).polluted, undefined, "Object.prototype must remain unpolluted");
});
