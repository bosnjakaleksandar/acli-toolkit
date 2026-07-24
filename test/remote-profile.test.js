import test from "node:test";
import assert from "node:assert/strict";
import { buildSshArgs, databaseCommand, renderTemplate, resolveRemoteProfile, RemoteProfileService } from "../src/services/RemoteProfileService.ts";

const profile = { ssh: { host: "example.com", username: "{projectName}", identityFile: "~/.ssh/staging", hostKeyPolicy: "accept-new" }, remote: { projectRoot: "/srv/{projectName}", wordpressRoot: "wordpress" }, files: { transport: "rsync" }, database: { driver: "wp-cli" }, urls: { staging: "https://{projectName}.example.com" } };

test("remote profiles independently resolve connection, paths and URLs", () => {
  const resolved = resolveRemoteProfile(profile, { projectName: "demo" });
  assert.equal(resolved.ssh.username, "demo");
  assert.equal(resolved.remote.wordpressRoot, "/srv/demo/wordpress");
  assert.equal(resolved.urls.staging, "https://demo.example.com");
});

test("SSH arguments are arrays and include declared host policy", () => {
  const args = buildSshArgs({ host: "example.com", username: "deploy", port: 2222, identityFile: "/key", hostKeyPolicy: "accept-new" }, "true");
  assert.deepEqual(args.slice(0, 4), ["-p", "2222", "-i", "/key"]);
  assert.equal(args.at(-2), "deploy@example.com");
});

test("template interpolation rejects unsafe values and unknown variables", () => {
  assert.throws(() => renderTemplate("/srv/{projectName}", { projectName: "bad;rm" }), /Unsafe value/);
  assert.throws(() => renderTemplate("/srv/{company}", { projectName: "demo" }), /Unknown profile template/);
});

test("Docker container discovery uses the declared remote env mapping", () => {
  const resolved = resolveRemoteProfile({ ...profile, database: { driver: "docker", discovery: "container-name", containerPattern: "{projectName}", envFile: ".env", userEnv: "DB_USER", passwordEnv: "DB_PASSWORD", nameEnv: "DB_NAME" } }, { projectName: "demo" });
  const command = databaseCommand(resolved);
  assert.match(command, /docker ps/);
  assert.match(command, /DB_USER/);
  assert.match(command, /docker exec/);
});

test("database exports request binary-safe command output", async () => {
  let receivedOptions;
  const service = new RemoteProfileService(
    resolveRemoteProfile(profile, { projectName: "demo" }),
    async (_command, _args, options) => { receivedOptions = options; return Buffer.alloc(128, 1); },
  );
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-binary-");
  await service.exportDatabase(directory);
  assert.deepEqual(receivedOptions, { encoding: null });
});

test("getRemoteFacts fetches table prefix and siteurl via wp-cli over SSH", async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    const remoteCommand = args.at(-1);
    if (remoteCommand.includes("table_prefix")) return "wp_demo_";
    if (remoteCommand.includes("siteurl")) return "https://demo.staging.example.com";
    throw new Error(`unexpected remote command: ${remoteCommand}`);
  };
  const service = new RemoteProfileService(resolveRemoteProfile(profile, { projectName: "demo" }), runner);
  const facts = await service.getRemoteFacts();
  assert.deepEqual(facts, { tablePrefix: "wp_demo_", siteUrl: "https://demo.staging.example.com" });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.command === "ssh"));
  assert.ok(calls.every((call) => call.args.at(-1).includes("cd '/srv/demo/wordpress'")));
});

test("getRemoteFacts returns nulls for non-wp-cli drivers without making any SSH call", async () => {
  let calls = 0;
  const runner = async () => { calls += 1; return ""; };
  const dockerProfile = resolveRemoteProfile({ ...profile, database: { driver: "docker", service: "db" } }, { projectName: "demo" });
  const service = new RemoteProfileService(dockerProfile, runner);
  const facts = await service.getRemoteFacts();
  assert.deepEqual(facts, { tablePrefix: null, siteUrl: null });
  assert.equal(calls, 0);
});

test("getRemoteFacts tolerates a failing individual command by returning null for that field", async () => {
  const runner = async (_command, args) => {
    const remoteCommand = args.at(-1);
    if (remoteCommand.includes("table_prefix")) throw new Error("wp-cli not found");
    return "https://demo.staging.example.com";
  };
  const service = new RemoteProfileService(resolveRemoteProfile(profile, { projectName: "demo" }), runner);
  const facts = await service.getRemoteFacts();
  assert.equal(facts.tablePrefix, null);
  assert.equal(facts.siteUrl, "https://demo.staging.example.com");
});

test("getRemoteFacts uses an explicit database.tablePrefix override and skips fetching it remotely", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push(args.at(-1)); return "https://demo.staging.example.com"; };
  const withOverride = resolveRemoteProfile({ ...profile, database: { driver: "wp-cli", tablePrefix: "wp_custom_" } }, { projectName: "demo" });
  const service = new RemoteProfileService(withOverride, runner);
  const facts = await service.getRemoteFacts();
  assert.equal(facts.tablePrefix, "wp_custom_");
  assert.equal(facts.siteUrl, "https://demo.staging.example.com");
  assert.ok(!calls.some((command) => command.includes("table_prefix")), "should not fetch table_prefix remotely when an override is set");
});

test("getRemoteFacts honors an explicit database.tablePrefix override even for non-wp-cli drivers", async () => {
  const service = new RemoteProfileService(
    resolveRemoteProfile({ ...profile, database: { driver: "docker", service: "db", tablePrefix: "wp_custom_" } }, { projectName: "demo" }),
    async () => { throw new Error("no ssh calls expected"); },
  );
  const facts = await service.getRemoteFacts();
  assert.deepEqual(facts, { tablePrefix: "wp_custom_", siteUrl: null });
});

test("syncFiles resolves target names to their configured remote/local paths", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push({ command, args }); return ""; };
  const withTargets = resolveRemoteProfile({ ...profile, files: { transport: "rsync", targets: { uploads: { path: "wp-content/uploads", excludes: ["*.log"] }, mu: { path: "wp-content/mu-plugins" } } } }, { projectName: "demo" });
  const service = new RemoteProfileService(withTargets, runner);
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-sync-");
  await service.syncFiles(directory, null);

  assert.equal(calls.length, 2);
  const uploadsCall = calls.find((call) => call.args.some((arg) => arg.includes("wp-content/uploads")));
  assert.ok(uploadsCall.args.includes("--exclude"));
  assert.ok(uploadsCall.args.some((arg) => arg.includes("/srv/demo/wordpress/wp-content/uploads/")));
  const muCall = calls.find((call) => call.args.some((arg) => arg.includes("wp-content/mu-plugins")));
  assert.ok(muCall);
});

test("syncFiles honors a target-name subset override without needing path overrides", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push(args); return ""; };
  const withTargets = resolveRemoteProfile({ ...profile, files: { transport: "rsync", targets: { uploads: { path: "wp-content/uploads" }, plugins: { path: "wp-content/plugins" } } } }, { projectName: "demo" });
  const service = new RemoteProfileService(withTargets, runner);
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-sync-subset-");
  await service.syncFiles(directory, null, { directories: ["uploads"] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].some((arg) => arg.includes("wp-content/uploads")));
});
