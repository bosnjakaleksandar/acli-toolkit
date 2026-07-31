import test from "node:test";
import assert from "node:assert/strict";
import { applyProjectTypeChange } from "../src/projects/prompts/projectPrompts.ts";

test("editing a new project type clears stale legacy import fields", () => {
  const ctx = { setupType: "existing-wp", appType: "wordpress", projectType: "wp-existing", profile: "shared-host", stagingUrl: "https://client-site.staging" };
  const result = applyProjectTypeChange(ctx, "wp-woo");
  assert.equal(result.setupType, "new");
  assert.equal(result.projectType, "wp-woo");
  assert.equal(result.wpType, "wp-woo");
  assert.equal(result.profile, undefined);
  assert.equal(result.stagingUrl, undefined);
});

test("switching to react/nextjs sets the application shape and clears wpType", () => {
  const result = applyProjectTypeChange({ wpType: "wp-theme" }, "nextjs");
  assert.equal(result.appType, "application");
  assert.equal(result.framework, "nextjs");
  assert.equal(result.projectType, "nextjs");
  assert.equal(result.wpType, null);
});
