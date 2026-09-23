import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import {
  buildProjectSummary,
  buildSuccessSummary,
  formatCreateError,
} from "../src/ui/summaries.ts";

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

test("success summary gives location and executable next steps", () => {
  const result = plain(buildSuccessSummary("/work/app", {
    projectName: "app", environment: "docker", skipGitInit: false,
  }, "  cd app\n  npm run dev"));
  assert.match(result, /app is ready/);
  assert.match(result, /Location\s+\/work\/app/);
  assert.match(result, /Next:\n  cd app\n  npm run dev/);
});

test("success summary reports the observed linked branch instead of the internal skip flag", () => {
  const result = plain(buildSuccessSummary("/work/app", {
    projectName: "app", environment: "docker", skipGitInit: true, gitStatus: "Linked to origin/main (pull-only)",
  }, "  cd app"));
  assert.match(result, /Git\s+Linked to origin\/main \(pull-only\)/);
  assert.doesNotMatch(result, /Not initialized/);
});

test("error summary reports no cleanup needed when failure happened before any files were created", () => {
  const result = plain(formatCreateError(new Error("Missing required tools: docker."), {
    targetDir: "/work/site", ownsTargetDir: false,
  }));
  assert.match(result, /Project creation failed/);
  assert.match(result, /Cause: Missing required tools: docker\./);
  assert.match(result, /No project files were created; nothing to clean up\./);
  assert.match(result, /--verbose/);
});

test("error summary preserves the project directory (never deletes it) once files may already exist, and offers a resume command", () => {
  const result = plain(formatCreateError(new Error("SSH authentication failed"), {
    targetDir: "/work/site", ownsTargetDir: true, resumeCommand: "acli create --resume --name site",
  }));
  assert.match(result, /Project creation failed/);
  assert.match(result, /Cause: SSH authentication failed/);
  assert.match(result, /Project directory was preserved: \/work\/site/);
  assert.match(result, /Resume:\s+acli create --resume --name site/);
});

test("summaries show the chosen environment, including running natively", () => {
  const native = plain(buildProjectSummary({
    projectName: "storefront", projectType: "react", appType: "application", environment: "none", skipGitInit: false,
  }, "/work/storefront"));
  assert.match(native, /Environment\s+None \(runs natively\)/);

  const docker = plain(buildSuccessSummary("/work/storefront", {
    projectName: "storefront", appType: "application", environment: "docker", skipGitInit: false,
  }, "  cd storefront\n  docker compose up"));
  assert.match(docker, /Environment\s+Docker Compose/);
});
