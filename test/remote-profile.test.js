import test from "node:test";
import assert from "node:assert/strict";
import { SshHost } from "../src/providers/ssh/SshHost.ts";
import { renderTemplate, resolveRemoteProfile } from "../src/providers/resolveProfile.ts";
import { buildSshArgs } from "../src/providers/sshArgs.ts";

const profile = { ssh: { host: "example.com", username: "{projectName}", identityFile: "~/.ssh/staging", hostKeyPolicy: "accept-new" }, remote: { projectRoot: "/srv/{projectName}", wordpressRoot: "wordpress" }, database: { driver: "wp-cli" }, urls: { staging: "https://{projectName}.example.com" } };

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

test("resolveRemoteProfile rejects an ssh.username that would be parsed as an ssh/rsync/scp option (leading '-')", () => {
  assert.throws(
    () => resolveRemoteProfile({ ...profile, ssh: { ...profile.ssh, username: "-oProxyCommand=x" } }, { projectName: "demo" }),
    /Unsafe value for profile field "ssh.username"/,
  );
});

test("resolveRemoteProfile rejects an ssh.host containing shell metacharacters", () => {
  assert.throws(
    () => resolveRemoteProfile({ ...profile, ssh: { ...profile.ssh, host: "evil.com; rm -rf ~" } }, { projectName: "demo" }),
    /Unsafe value for profile field "ssh.host"/,
  );
});

test("resolveRemoteProfile rejects an identityFile containing spaces/shell metacharacters (rsync -e is a single word-split string, not an argv array)", () => {
  assert.throws(
    () => resolveRemoteProfile({ ...profile, ssh: { ...profile.ssh, identityFile: "/tmp/k -o ProxyCommand=sh -c id" } }, { projectName: "demo" }),
    /Unsafe value for profile field "ssh.identityFile"/,
  );
});

test("rsync's -e transport honors hostKeyPolicy the same way buildSshArgs does for direct ssh calls", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push({ command, args }); return ""; };
  const insecureProfile = resolveRemoteProfile({ ...profile, ssh: { ...profile.ssh, hostKeyPolicy: "insecure" }, files: { targets: { uploads: { path: "wp-content/uploads" } } } }, { projectName: "demo" });
  const service = new SshHost(insecureProfile, runner);
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-sync-hostkey-");
  await service.syncFiles(directory, null);
  const rsyncCall = calls.find((call) => call.command === "rsync");
  const transport = rsyncCall.args[rsyncCall.args.indexOf("-e") + 1];
  assert.match(transport, /StrictHostKeyChecking=no/);
  assert.match(transport, /UserKnownHostsFile=\/dev\/null/);
});

test("exportDatabase runs wp db export in the remote WordPress root", async () => {
  let remoteCommand;
  const service = new SshHost(resolveRemoteProfile(profile, { projectName: "demo" }), async (_command, args) => { remoteCommand = args.at(-1); return Buffer.alloc(128, 1); });
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-wpcli-");
  await service.exportDatabase(directory);
  assert.equal(remoteCommand, "cd '/srv/demo/wordpress' && wp db export - --quiet");
});

test("database exports request binary-safe command output", async () => {
  let receivedOptions;
  const service = new SshHost(
    resolveRemoteProfile(profile, { projectName: "demo" }),
    async (_command, _args, options) => { receivedOptions = options; return Buffer.alloc(128, 1); },
  );
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-binary-");
  await service.exportDatabase(directory);
  assert.equal(receivedOptions.encoding, null);
  assert.equal(receivedOptions.stdoutFile, `${directory}/staging.sql`);
});

test("exportDatabase writes staging.sql at mode 0600 (a full DB dump may include real password hashes)", async () => {
  const fs = (await import("fs-extra")).default;
  const service = new SshHost(
    resolveRemoteProfile(profile, { projectName: "demo" }),
    async () => Buffer.alloc(128, 1),
  );
  const directory = await fs.mkdtemp("/tmp/acli-dump-mode-");
  await service.exportDatabase(directory);
  const stat = await fs.stat(`${directory}/staging.sql`);
  assert.equal(stat.mode & 0o777, 0o600);
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
  const service = new SshHost(resolveRemoteProfile(profile, { projectName: "demo" }), runner);
  const facts = await service.getRemoteFacts();
  assert.deepEqual(facts, { tablePrefix: "wp_demo_", siteUrl: "https://demo.staging.example.com" });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.command === "ssh"));
  assert.ok(calls.every((call) => call.args.at(-1).includes("cd '/srv/demo/wordpress'")));
});

test("getRemoteFacts tolerates a failing individual command by returning null for that field", async () => {
  const runner = async (_command, args) => {
    const remoteCommand = args.at(-1);
    if (remoteCommand.includes("table_prefix")) throw new Error("wp-cli not found");
    return "https://demo.staging.example.com";
  };
  const service = new SshHost(resolveRemoteProfile(profile, { projectName: "demo" }), runner);
  const facts = await service.getRemoteFacts();
  assert.equal(facts.tablePrefix, null);
  assert.equal(facts.siteUrl, "https://demo.staging.example.com");
});

test("getRemoteFacts uses an explicit database.tablePrefix override and skips fetching it remotely", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push(args.at(-1)); return "https://demo.staging.example.com"; };
  const withOverride = resolveRemoteProfile({ ...profile, database: { driver: "wp-cli", tablePrefix: "wp_custom_" } }, { projectName: "demo" });
  const service = new SshHost(withOverride, runner);
  const facts = await service.getRemoteFacts();
  assert.equal(facts.tablePrefix, "wp_custom_");
  assert.equal(facts.siteUrl, "https://demo.staging.example.com");
  assert.ok(!calls.some((command) => command.includes("table_prefix")), "should not fetch table_prefix remotely when an override is set");
});

test("syncFiles resolves target names to their configured remote/local paths", async () => {
  const calls = [];
  const runner = async (command, args) => { calls.push({ command, args }); return ""; };
  const withTargets = resolveRemoteProfile({ ...profile, files: { targets: { uploads: { path: "wp-content/uploads", excludes: ["*.log"] }, mu: { path: "wp-content/mu-plugins" } } } }, { projectName: "demo" });
  const service = new SshHost(withTargets, runner);
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
  const withTargets = resolveRemoteProfile({ ...profile, files: { targets: { uploads: { path: "wp-content/uploads" }, plugins: { path: "wp-content/plugins" } } } }, { projectName: "demo" });
  const service = new SshHost(withTargets, runner);
  const directory = await (await import("fs-extra")).default.mkdtemp("/tmp/acli-sync-subset-");
  await service.syncFiles(directory, null, { directories: ["uploads"] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].some((arg) => arg.includes("wp-content/uploads")));
});
