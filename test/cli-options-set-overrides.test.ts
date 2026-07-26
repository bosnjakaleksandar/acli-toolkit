import test from "node:test";
import assert from "node:assert/strict";
import { parseSetOverrides } from "../src/projects/plan/PlanBuilder.ts";

test("parseSetOverrides builds a nested object from dotted key=value pairs", () => {
  // The result's objects are Object.create(null) (see the prototype-pollution
  // fix below), so compare fields rather than assert.deepEqual against a
  // {}-literal — the two have different (but functionally irrelevant) prototypes.
  const result = parseSetOverrides(["database.host=localhost", "database.port=3306", "verbose=true"]) as any;
  assert.equal(result.database.host, "localhost");
  assert.equal(result.database.port, 3306);
  assert.equal(result.verbose, true);
});

test("parseSetOverrides rejects __proto__/constructor/prototype segments instead of polluting Object.prototype", () => {
  assert.throws(() => parseSetOverrides(["constructor.prototype.polluted=1"]), /Invalid --set key/);
  assert.throws(() => parseSetOverrides(["__proto__.polluted=1"]), /Invalid --set key/);
  assert.throws(() => parseSetOverrides(["a.prototype.polluted=1"]), /Invalid --set key/);
  assert.equal(({} as any).polluted, undefined, "Object.prototype must remain unpolluted");
});
