import test from "node:test";
import assert from "node:assert/strict";
import { applyProjectTypeChange } from "../src/projects/prompts/projectPrompts.ts";

test("re-selecting existing-wp keeps the attached profile and staging URL", () => {
  const ctx = { setupType: "existing-wp", appType: "wordpress", projectType: "wp-existing", projectName: "client-site", profile: "shared-host", stagingUrl: "https://client-site.staging" };
  const result = applyProjectTypeChange(ctx, "existing-wp");
  assert.equal(result.setupType, "existing-wp");
  assert.equal(result.projectType, "wp-existing");
  assert.equal(result.profile, "shared-host");
  assert.equal(result.stagingUrl, "https://client-site.staging");
});

test("switching to existing-wp from a new-project type does not fabricate a profile", () => {
  const ctx = { setupType: "new", appType: "application", projectType: "react", framework: "react" };
  const result = applyProjectTypeChange(ctx, "existing-wp");
  assert.equal(result.setupType, "existing-wp");
  assert.equal(result.profile, undefined);
  assert.equal(result.stagingUrl, undefined);
});

test("switching away from existing-wp to a new project type clears the stale profile and staging URL", () => {
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
