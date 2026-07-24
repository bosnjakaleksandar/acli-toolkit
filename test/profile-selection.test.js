import test from "node:test";
import assert from "node:assert/strict";
import { profileOption, profileSummary, resolveProfileSelection } from "../src/services/ProfileSelectionService.ts";

const profiles = {
  "shared-host": { ssh: { host: "example.com", username: "deploy" }, remote: { projectRoot: "/srv/demo", wordpressRoot: "wordpress" }, files: { transport: "rsync" }, database: { driver: "wp-cli" } },
};

test("resolves the sole available profile automatically when one is required and none is specified", async () => {
  const result = await resolveProfileSelection({ config: { profiles }, options: {}, attachedProfileName: undefined, required: true, nonInteractive: true });
  assert.equal(result.profileName, "shared-host");
  assert.equal(result.profile.ssh.host, "example.com");
});

test("an explicit --profile option wins over an attached context profile", async () => {
  const twoProfiles = { ...profiles, other: profiles["shared-host"] };
  const result = await resolveProfileSelection({ config: { profiles: twoProfiles }, options: { profile: "other" }, attachedProfileName: "shared-host", required: true, nonInteractive: true });
  assert.equal(result.profileName, "other");
});

test("throws when a profile is required, none is specified, and none can be inferred non-interactively", async () => {
  const twoProfiles = { ...profiles, other: profiles["shared-host"] };
  await assert.rejects(
    () => resolveProfileSelection({ config: { profiles: twoProfiles }, options: {}, attachedProfileName: undefined, required: true, nonInteractive: true }),
    /requires a profile/,
  );
});

test("returns no profile when not required and none is specified", async () => {
  const result = await resolveProfileSelection({ config: { profiles: {} }, options: {}, attachedProfileName: undefined, required: false, nonInteractive: true });
  assert.equal(result.profile, null);
  assert.equal(result.profileName, undefined);
});

test("profileOption formats a readable label with host, driver, and transport", () => {
  const option = profileOption("shared-host", profiles["shared-host"]);
  assert.equal(option.value, "shared-host");
  assert.match(option.label, /example\.com/);
  assert.match(option.label, /wp-cli/);
});

test("profileSummary lists connection, database, and local environment details", () => {
  const summary = profileSummary(profiles["shared-host"], "docker");
  assert.match(summary, /deploy@example\.com/);
  assert.match(summary, /Local: docker/);
});
