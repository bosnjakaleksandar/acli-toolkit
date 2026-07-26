import test from "node:test";
import assert from "node:assert/strict";
import { isSafeGitUrl, isSafePluginSlug, isSafeSshKeyPath } from "../src/system/safety.ts";

test("isSafeGitUrl accepts https, ssh, scp-like, and local-path git specs", () => {
  assert.ok(isSafeGitUrl("https://github.com/example/repo.git"));
  assert.ok(isSafeGitUrl("ssh://git@github.com/example/repo.git"));
  assert.ok(isSafeGitUrl("git@github.com:starter-theme.git"));
  assert.ok(isSafeGitUrl("/tmp/acli-import-git-repo-abc123"));
  assert.ok(isSafeGitUrl("../sibling-repo"));
});

test("isSafeGitUrl rejects git's ext::/fd:: remote-helper schemes (documented RCE vectors)", () => {
  assert.equal(isSafeGitUrl('ext::sh -c "id>/tmp/x"'), false);
  assert.equal(isSafeGitUrl("fd::3"), false);
});

test("isSafeGitUrl rejects values that would be parsed as a git option", () => {
  assert.equal(isSafeGitUrl("--upload-pack=touch /tmp/pwned"), false);
});

test("isSafeGitUrl rejects non-strings, empty strings, and shell-metacharacter-bearing values", () => {
  assert.equal(isSafeGitUrl(undefined), false);
  assert.equal(isSafeGitUrl(""), false);
  assert.equal(isSafeGitUrl("repo; rm -rf ~"), false);
  assert.equal(isSafeGitUrl("repo`id`"), false);
});

test("isSafeSshKeyPath accepts plain paths and rejects metacharacters or a leading '-'", () => {
  assert.ok(isSafeSshKeyPath("/Users/dev/.ssh/id_ed25519"));
  assert.ok(isSafeSshKeyPath("~/.ssh/staging"));
  assert.equal(isSafeSshKeyPath("/tmp/k -o ProxyCommand=sh -c id"), false);
  assert.equal(isSafeSshKeyPath("-oProxyCommand=x"), false);
  assert.equal(isSafeSshKeyPath(""), false);
});

test("isSafePluginSlug matches WordPress.org's slug grammar and rejects shell metacharacters", () => {
  assert.ok(isSafePluginSlug("woocommerce"));
  assert.ok(isSafePluginSlug("advanced-custom-fields"));
  assert.equal(isSafePluginSlug("woocommerce; rm -rf ~"), false);
  assert.equal(isSafePluginSlug("Woocommerce"), false);
  assert.equal(isSafePluginSlug(""), false);
});
