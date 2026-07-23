import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import {
  buildProjectSummary,
  buildSuccessSummary,
  formatCreateError,
} from "../src/services/CreateProjectUxService.js";

const plain = (value) => stripVTControlCharacters(value);

test("project summary presents the important choices before creation", () => {
  const result = plain(buildProjectSummary({
    projectName: "storefront",
    projectType: "nextjs",
    useLaravel: true,
    environment: "docker",
    skipGitInit: false,
  }, "/work/storefront"));

  assert.match(result, /Name\s+storefront/);
  assert.match(result, /Type\s+Next\.js \+ Laravel/);
  assert.match(result, /Environment\s+Docker Compose/);
  assert.match(result, /Directory\s+\/work\/storefront/);
  assert.match(result, /Git\s+Initialize repository/);
});

test("existing WordPress summary includes remote operations", () => {
  const result = plain(buildProjectSummary({
    projectName: "client",
    projectType: "wp-existing",
    setupType: "existing-wp",
    environment: "lando",
    skipFiles: false,
    skipDatabase: true,
    profile: { ssh: { host: "staging.example.com" }, files: { transport: "sftp" }, database: { driver: "wp-cli" } },
  }, "/work/client"));

  assert.match(result, /Remote\s+staging\.example\.com/);
  assert.match(result, /Files\s+sftp/);
  assert.match(result, /Database\s+Skip/);
});

test("success summary gives location and executable next steps", () => {
  const result = plain(buildSuccessSummary("/work/app", {
    projectName: "app", environment: "docker", skipGitInit: false,
  }, "  cd app\n  npm run dev"));
  assert.match(result, /app is ready/);
  assert.match(result, /Location\s+\/work\/app/);
  assert.match(result, /Next:\n  cd app\n  npm run dev/);
});

test("error summary explains cause, cleanup, and recovery", () => {
  const result = plain(formatCreateError(new Error("SSH authentication failed"), {
    targetDir: "/work/site", cleanedUp: true,
  }));
  assert.match(result, /Project creation failed/);
  assert.match(result, /Cause: SSH authentication failed/);
  assert.match(result, /Incomplete project files were removed/);
  assert.match(result, /acli doctor/);
});

test("application-type projects omit the Environment row (no docker-compose.yaml/.lando.yml is scaffolded for them)", () => {
  const summary = plain(buildProjectSummary({
    projectName: "storefront", projectType: "react", appType: "application", environment: "docker", skipGitInit: false,
  }, "/work/storefront"));
  assert.doesNotMatch(summary, /Environment/);

  const success = plain(buildSuccessSummary("/work/storefront", {
    projectName: "storefront", appType: "application", environment: "docker", skipGitInit: false,
  }, "  cd storefront\n  npm run dev"));
  assert.doesNotMatch(success, /Environment/);
});
