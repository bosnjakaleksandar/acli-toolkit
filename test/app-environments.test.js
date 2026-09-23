import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import DockerComposeService from "../src/environments/DockerEnvironment.ts";
import LandoService from "../src/environments/LandoEnvironment.ts";
import ReactStrategy from "../src/projects/strategies/ReactStrategy.ts";
import NextjsStrategy from "../src/projects/strategies/NextjsStrategy.ts";
import { resolveStrategy } from "../src/projects/strategies/registry.ts";
import { validateProjectContext } from "../src/projects/plan/PlanBuilder.ts";
import { applyProjectTypeChange, environmentOptions } from "../src/projects/prompts/projectPrompts.ts";
import { buildNextSteps } from "../src/projects/nextSteps.ts";

const plain = (text) => text.replace(/\x1B\[[0-9;]*m/g, "");

async function render(Service, type, options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-app-env-"));
  await new Service({ runner: async () => "" }).scaffold(dir, type, { projectName: "demo", mysqlVersion: "8.0", ...options });
  const file = Service === DockerComposeService ? "docker-compose.yaml" : ".lando.yml";
  const content = await fs.readFile(path.join(dir, file), "utf8");
  await fs.remove(dir);
  return content;
}

test("every project type renders a valid Docker and Lando file with no placeholder left", async () => {
  for (const Service of [DockerComposeService, LandoService]) {
    for (const [type, options] of [["react", {}], ["nextjs", {}], ["laravel", { framework: "react" }], ["laravel", { framework: "nextjs" }], ["wordpress", { tablePrefix: "wp_" }]]) {
      const content = await render(Service, type, options);
      assert.doesNotMatch(content, /\{\{/, `${Service.name} ${type}: unreplaced placeholder`);
      assert.doesNotThrow(() => YAML.parse(content), `${Service.name} ${type}: invalid YAML`);
    }
  }
});

test("application Docker files publish ports on 127.0.0.1 only", async () => {
  for (const [type, options] of [["react", {}], ["nextjs", {}], ["laravel", { framework: "react" }]]) {
    const compose = YAML.parse(await render(DockerComposeService, type, options));
    for (const [name, service] of Object.entries(compose.services)) {
      for (const port of service.ports || []) assert.match(String(port), /^127\.0\.0\.1:/, `${type}/${name}: ${port}`);
    }
  }
});

test("the Laravel environment runs the database, backend and the chosen frontend together", async () => {
  const withNext = YAML.parse(await render(DockerComposeService, "laravel", { framework: "nextjs", mysqlVersion: "mariadb:11.4" }));
  assert.deepEqual(Object.keys(withNext.services), ["db", "backend", "frontend"]);
  assert.equal(withNext.services.db.image, "mariadb:11.4");
  assert.equal(withNext.services.backend.environment.DB_HOST, "db");
  assert.deepEqual(withNext.services.frontend.ports, ["127.0.0.1:3000:3000"]);
  assert.match(withNext.services.frontend.command, /--hostname 0\.0\.0\.0 --port 3000/);

  const withReact = YAML.parse(await render(DockerComposeService, "laravel", { framework: "react" }));
  assert.deepEqual(withReact.services.frontend.ports, ["127.0.0.1:5173:5173"]);

  const lando = YAML.parse(await render(LandoService, "laravel", { framework: "react" }));
  assert.equal(lando.recipe, "laravel");
  assert.equal(lando.config.webroot, "backend/public");
  assert.equal(lando.services.frontend.port, 5173);
});

test("React and Next.js write their environment next to the app; natively they write none", async () => {
  for (const [Strategy, type] of [[ReactStrategy, "react"], [NextjsStrategy, "nextjs"]]) {
    const scaffolded = [];
    const envService = { scaffold: async (_dir, templateType) => { scaffolded.push(templateType); } };
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "acli-app-env-strategy-"));
    await new Strategy(envService, { runner: async () => "" }).scaffold(path.join(work, "app"), { projectName: "app" }, null);
    await new Strategy(null, { runner: async () => "" }).scaffold(path.join(work, "app2"), { projectName: "app2" }, null);
    assert.deepEqual(scaffolded, [type]);
    await fs.remove(work);
  }
});

test("with Laravel, only the project root gets an environment — not the frontend folder", () => {
  const envService = { scaffold: async () => {} };
  const strategy = resolveStrategy({ appType: "application", framework: "react", useLaravel: true }, envService);
  assert.equal(strategy.envService, envService);
  assert.equal(strategy.frontendStrategy.envService, null);
  assert.equal(resolveStrategy({ appType: "application", framework: "react" }, envService).envService, envService);
});

test("'none' is allowed for applications and refused for WordPress", () => {
  assert.doesNotThrow(() => validateProjectContext({ appType: "application", environment: "none" }));
  assert.throws(() => validateProjectContext({ appType: "wordpress", environment: "none" }), /WordPress projects need docker or lando/);
  assert.deepEqual(environmentOptions("application").map((option) => option.value), ["none", "docker", "lando"]);
  assert.deepEqual(environmentOptions("wordpress").map((option) => option.value), ["docker", "lando"]);
  assert.equal(applyProjectTypeChange({ appType: "application", environment: "none" }, "wp-theme").environment, "docker", "switching to WordPress picks a real environment");
});

test("next steps start the environment when there is one, and the dev servers when native", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-app-env-steps-"));
  const docker = plain((await buildNextSteps(dir, { projectName: "shop", appType: "application", projectType: "nextjs", environment: "docker", useLaravel: true })).nextSteps);
  assert.match(docker, /docker compose up/);
  assert.match(docker, /backend http:\/\/localhost:8000/);
  assert.match(docker, /frontend http:\/\/localhost:3000/);
  assert.doesNotMatch(docker, /php artisan serve/);

  const lando = plain((await buildNextSteps(dir, { projectName: "shop", appType: "application", projectType: "react", environment: "lando" })).nextSteps);
  assert.match(lando, /lando start/);
  assert.match(lando, /http:\/\/shop\.lndo\.site/);

  const native = plain((await buildNextSteps(dir, { projectName: "shop", appType: "application", projectType: "react", environment: "none" })).nextSteps);
  assert.match(native, /npm run dev/);
  assert.doesNotMatch(native, /docker|lando/);
  await fs.remove(dir);
});
