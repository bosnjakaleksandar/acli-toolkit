import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { hasUrlCredentials, isSafeGitUrl, redactUrlCredentials } from "../src/system/safety.ts";
import { GitSource } from "../src/wordpress/import/sources/GitSource.ts";

/**
 * Regression coverage for phase 1f: a git remote URL embedding credentials
 * in its userinfo (`https://token@host/...`, `https://user:pass@host/...`)
 * previously passed isSafeGitUrl unchanged, and — even where it was
 * rejected — the raw URL (including the credential) still reached spinner
 * messages, thrown errors, and verbose command logs.
 */

test("hasUrlCredentials flags http(s)/git/file userinfo (bare username or user:password) but not a bare ssh username", () => {
  assert.equal(hasUrlCredentials("https://ghp_TOKEN@github.com/a/b.git"), true);
  assert.equal(hasUrlCredentials("https://x-access-token:ghp_TOKEN@github.com/a/b.git"), true);
  assert.equal(hasUrlCredentials("git://user@host/repo.git"), true);
  assert.equal(hasUrlCredentials("ssh://deploy:secret@host/a/b.git"), true);
  assert.equal(hasUrlCredentials("ssh://git@github.com/a/b.git"), false, "a bare ssh username is the ordinary way to name which account to connect as");
  assert.equal(hasUrlCredentials("https://github.com/a/b.git"), false);
});

test("isSafeGitUrl rejects any URL embedding credentials, still accepts the ordinary scp-like and bare-ssh-username forms", () => {
  assert.equal(isSafeGitUrl("https://user:ghp_TOKEN@github.com/a/b.git"), false);
  assert.equal(isSafeGitUrl("https://ghp_TOKEN@github.com/a/b.git"), false);
  assert.equal(isSafeGitUrl("http://attacker.example.com/exfil/${SECRET}"), true, "isSafeGitUrl is a shape check, not a content check — this is intentionally not a credential itself");
  assert.equal(isSafeGitUrl("ssh://deploy:secret@host/a/b.git"), false);

  assert.equal(isSafeGitUrl("git@github.com:starter-theme.git"), true);
  assert.equal(isSafeGitUrl("ssh://git@github.com/example/repo.git"), true);
  assert.equal(isSafeGitUrl("https://github.com/example/repo.git"), true);
});

test("redactUrlCredentials masks userinfo wherever a credentialed URL appears inside free-form text, leaving plain text untouched", () => {
  assert.equal(redactUrlCredentials("Cloning https://user:ghp_TOKEN@github.com/a/b.git..."), "Cloning https://***@github.com/a/b.git...");
  assert.equal(redactUrlCredentials("Failed to clone https://ghp_TOKEN@github.com/a/b.git: exit 1"), "Failed to clone https://***@github.com/a/b.git: exit 1");
  assert.equal(redactUrlCredentials("no url in this message"), "no url in this message");
  assert.equal(redactUrlCredentials("two: https://a:b@x.com and ssh://c:d@y.com"), "two: https://***@x.com and ssh://***@y.com");
});

test("GitSource.fetchFiles rejects a credentialed --repo URL before ever invoking git, and never reproduces the credential in its error", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-git-cred-"));
  await assert.rejects(
    () => GitSource.fetchFiles({ targetDir, repositoryUrl: "https://x-access-token:ghp_SUPERSECRET@github.com/org/repo.git" }),
    (error: unknown) => {
      assert.match((error as Error).message, /Unsafe or invalid git repository URL/);
      assert.doesNotMatch((error as Error).message, /ghp_SUPERSECRET/);
      return true;
    },
  );
  await fs.remove(targetDir);
});
