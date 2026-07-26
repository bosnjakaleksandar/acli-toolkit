import test from "node:test";
import assert from "node:assert/strict";
import { resolveDbImage, resolveTemplateName } from "../src/environments/templateMap.ts";
import { assertSafeWpVersion, assertSafeTablePrefix } from "../src/system/safety.ts";

test("resolveTemplateName maps known aliases and passes through unknown types unchanged", () => {
  assert.equal(resolveTemplateName("wp-existing"), "wordpress");
  assert.equal(resolveTemplateName("react"), "app");
  assert.equal(resolveTemplateName("laravel"), "laravel");
});

test("resolveDbImage accepts a plain MySQL version and a mariadb:version spec", () => {
  assert.equal(resolveDbImage("8.0"), "mysql:8.0");
  assert.equal(resolveDbImage("mariadb:11.4"), "mariadb:11.4");
});

test("resolveDbImage/assertSafeWpVersion/assertSafeTablePrefix reject a value that would inject extra YAML into the generated compose/lando file", () => {
  const injected = "8.0\n    cap_add:\n      - SYS_ADMIN";
  assert.throws(() => resolveDbImage(injected), /Unsafe mysqlVersion/);
  assert.throws(() => assertSafeWpVersion(injected), /Unsafe wpVersion/);
  assert.throws(() => assertSafeTablePrefix("wp_\nevil: true"), /Unsafe database table prefix/);
});

test("assertSafeTablePrefix rejects non-identifier characters", () => {
  assert.throws(() => assertSafeTablePrefix("wp-prefix"), /Unsafe database table prefix/);
  assert.equal(assertSafeTablePrefix("wp_custom_"), "wp_custom_");
});
