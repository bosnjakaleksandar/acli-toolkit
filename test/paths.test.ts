import test from "node:test";
import assert from "node:assert/strict";
import { getLegacyUpdateCachePath, getProjectConfigPath, getUpdateCachePath, getUserConfigPath } from "../src/config/paths.ts";

test("update cache path lives in the same directory as the user config file", () => {
  const configPath = getUserConfigPath("linux", {}, "/home/dev");
  const cachePath = getUpdateCachePath("linux", {}, "/home/dev");
  assert.equal(cachePath, "/home/dev/.config/a-cli/update.json");
  assert.equal(cachePath.slice(0, cachePath.lastIndexOf("/")), configPath.slice(0, configPath.lastIndexOf("/")));
});

test("ACLI_CONFIG_HOME overrides both config and cache locations together", () => {
  const env = { ACLI_CONFIG_HOME: "/custom/dir" };
  assert.equal(getUserConfigPath("linux", env, "/home/dev"), "/custom/dir/config.yaml");
  assert.equal(getUpdateCachePath("linux", env, "/home/dev"), "/custom/dir/update.json");
});

test("legacy update cache path is the pre-unification ~/.a-cli/update.json", () => {
  assert.equal(getLegacyUpdateCachePath("/home/dev"), "/home/dev/.a-cli/update.json");
});

test("project config path stays under the project .acli directory", () => {
  assert.equal(getProjectConfigPath("/repo"), "/repo/.acli/config.yaml");
});
