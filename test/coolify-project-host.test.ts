import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import fs from "fs-extra";
import YAML from "yaml";
import { CoolifyProjectHost, parseExportPath, parseSelectionMenu } from "../src/providers/coolify/CoolifyProjectHost.ts";
import { createRemoteBackend } from "../src/providers/registry.ts";
import { createProfileImportSource } from "../src/wordpress/import/sources/RemoteSource.ts";
import { PullService } from "../src/wordpress/pull/PullService.ts";
import { SshHost } from "../src/providers/ssh/SshHost.ts";
import { resolveRemoteProfile } from "../src/providers/resolveProfile.ts";
import { validateProfileConfig } from "../src/config/schema.ts";
import { runCommand, runCommandSync } from "../src/system/commandRunner.ts";
import { linkGitRemote } from "../src/system/git.ts";
import { CliError } from "../src/core/errors.ts";
import type { Profile } from "../src/core/model/Profile.ts";

const rawProfile = {
  provider: "coolify-cli",
  ssh: { host: "staging.example.com", username: "developer" },
} as unknown as Profile;

const resolve = (profile: Profile = rawProfile, projectName = "Demo", target: { remoteProject?: string; selections?: Record<string, string> } = {}) => resolveRemoteProfile(profile, { projectName, ...target });

class NoToolCheckHost extends CoolifyProjectHost {
  requiredTools(): string[] { return []; }
}

async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acli-coolify-"));
  try { await run(directory); } finally { await fs.remove(directory); }
}

/**
 * Fake transport: `ssh` answers with the canned output for its `project`
 * subcommand, `scp` copies a local fixture in place of the remote export,
 * and `tar` runs for real so extraction checks are exercised end to end.
 */
function fakeRunner(outputs: Record<string, string>, fixtures: Record<string, string>) {
  const calls: { command: string; args: string[] }[] = [];
  const runner = (async (command: string, args: string[] = [], options: any = {}) => {
    calls.push({ command, args });
    if (command === "ssh") {
      const subcommand = args.at(-1)!.split(" ")[1]!;
      if (!(subcommand in outputs)) throw new Error(`unexpected project ${subcommand}`);
      return outputs[subcommand];
    }
    if (command === "scp") {
      const remotePath = args.at(-2)!.split(":").at(-1)!;
      await fs.copy(fixtures[remotePath]!, args.at(-1)!);
      return "";
    }
    return runCommand(command, args, options);
  }) as typeof runCommand;
  return { calls, runner };
}

async function componentArchive(directory: string, component: string, files: Record<string, string>): Promise<string> {
  const source = path.join(directory, "fixture-src");
  for (const [name, content] of Object.entries(files)) await fs.outputFile(path.join(source, component, name), content);
  const archive = path.join(directory, `fixture-${component}.tar.gz`);
  await runCommand("tar", ["-czf", archive, "-C", source, component]);
  await fs.remove(source);
  return archive;
}

test("parseExportPath reads the path printed after 'Export created:'", () => {
  const output = "Project:   Demo\nComponent: uploads\n\nExport created:\n  /var/backups/project-wordpress/demo/demo_uploads_2026-09-23_18-58-53.tar.gz";
  assert.equal(parseExportPath(output), "/var/backups/project-wordpress/demo/demo_uploads_2026-09-23_18-58-53.tar.gz");
  assert.equal(parseExportPath("Export created:\n  /var/backups/project-databases/demo/demo_2026-09-23_18-51-13.sql.gz"), "/var/backups/project-databases/demo/demo_2026-09-23_18-51-13.sql.gz");
});

test("parseExportPath returns null for a missing component and refuses unexpected paths", () => {
  assert.equal(parseExportPath("WordPress component is not present:\n  languages\n\nNothing to export."), null);
  assert.throws(() => parseExportPath("Export created:\n  /etc/passwd"), /unexpected export path/);
  assert.throws(() => parseExportPath("Export created:\n  /var/backups/project-wordpress/../x/a.tar.gz"), /unexpected export path/);
  assert.throws(() => parseExportPath("something else"), /did not report an export path/);
});

test("the shared runner refuses every state-changing remote project subcommand", () => {
  for (const remote of ["project wp-import 'demo' /tmp/x.tar.gz", "project 'db-import' demo /tmp/x.sql", "sudo /usr/local/bin/project deploy demo", "true; project branch demo main", "project db-backup demo", "project shell demo"]) {
    assert.throws(() => runCommandSync("ssh", ["-T", "user@host", remote]), /pull-only/, remote);
  }
});

test("CoolifyProjectHost only sends allow-listed read-only subcommands", async () => {
  const { calls, runner } = fakeRunner({}, {});
  const host = new CoolifyProjectHost(resolve(), runner) as any;
  for (const subcommand of ["wp-import", "db-import", "db-backup", "branch", "deploy", "shell", "logs"]) {
    await assert.rejects(() => host.projectCommand(subcommand, "Demo"), /pull-only/);
  }
  assert.equal(calls.length, 0);
});

test("syncFiles exports each component, downloads it with scp and unpacks it into wp-content", async () => {
  await withTempDir(async (directory) => {
    const remotePath = "/var/backups/project-wordpress/demo/demo_languages_2026-09-23_18-58-53.tar.gz";
    const archive = await componentArchive(directory, "languages", { "de_DE.mo": "translations" });
    const { calls, runner } = fakeRunner({ list: "Demo", "wp-export": `Export created:\n  ${remotePath}` }, { [remotePath]: archive });
    const target = path.join(directory, "site");
    await new CoolifyProjectHost(resolve(), runner).syncFiles(target, null, { directories: ["languages"] });

    assert.equal(await fs.readFile(path.join(target, "wp-content/languages/de_DE.mo"), "utf8"), "translations");
    const ssh = calls.find((call) => call.command === "ssh" && call.args.at(-1)!.startsWith("project wp-export"))!;
    assert.equal(ssh.args[0], "-T");
    assert.equal(ssh.args.at(-1), "project wp-export 'Demo' 'languages'");
    assert.deepEqual(await fs.readdir(path.join(target, ".acli/tmp")), [], "downloaded archive is removed");
  });
});

test("syncFiles skips a component the server reports as not present", async () => {
  await withTempDir(async (directory) => {
    const { calls, runner } = fakeRunner({ list: "Demo", "wp-export": "WordPress component is not present:\n  languages\n\nNothing to export." }, {});
    await new CoolifyProjectHost(resolve(), runner).syncFiles(path.join(directory, "site"), null, { directories: ["languages"] });
    assert.equal(calls.some((call) => call.command === "scp"), false);
  });
});

test("syncFiles refuses archives with unexpected top-level entries or links", async () => {
  await withTempDir(async (directory) => {
    const remotePath = "/var/backups/project-wordpress/demo/demo_uploads_1.tar.gz";
    const wrongRoot = await componentArchive(directory, "plugins", { "evil.php": "<?php" });
    const { runner } = fakeRunner({ list: "Demo", "wp-export": `Export created:\n  ${remotePath}` }, { [remotePath]: wrongRoot });
    const target = path.join(directory, "site");
    await assert.rejects(() => new CoolifyProjectHost(resolve(), runner).syncFiles(target, null, { directories: ["uploads"] }), /unexpected archive entry/);
    assert.equal(await fs.pathExists(path.join(target, "wp-content/plugins")), false);

    const source = path.join(directory, "link-src");
    await fs.outputFile(path.join(source, "uploads/real.txt"), "x");
    await fs.symlink("/etc/passwd", path.join(source, "uploads/link"));
    const withLink = path.join(directory, "link.tar.gz");
    await runCommand("tar", ["-czf", withLink, "-C", source, "uploads"]);
    const linked = fakeRunner({ list: "Demo", "wp-export": `Export created:\n  ${remotePath}` }, { [remotePath]: withLink });
    await assert.rejects(() => new CoolifyProjectHost(resolve(), linked.runner).syncFiles(target, null, { directories: ["uploads"] }), /links or special files/);
    assert.equal(await fs.pathExists(path.join(target, "wp-content/uploads")), false);
  });
});

test("exportDatabase uses db-export sql.gz and writes a mode-0600 staging.sql", async () => {
  await withTempDir(async (directory) => {
    const remotePath = "/var/backups/project-databases/demo/demo_2026-09-23_18-51-13.sql.gz";
    const sql = `-- dump\nCREATE TABLE \`wp_options\` (option_id bigint);\n${"INSERT INTO wp_options VALUES (1);\n".repeat(5)}`;
    const fixture = path.join(directory, "fixture.sql.gz");
    await fs.writeFile(fixture, gzipSync(sql));
    const { calls, runner } = fakeRunner({ list: "Demo", "db-export": `Engine:    mariadb\nExport created:\n  ${remotePath}` }, { [remotePath]: fixture });
    const target = path.join(directory, "site");
    await fs.ensureDir(target);
    await new CoolifyProjectHost(resolve(), runner).exportDatabase(target, null);

    const dumpPath = path.join(target, "staging.sql");
    assert.equal(await fs.readFile(dumpPath, "utf8"), sql);
    assert.equal((await fs.stat(dumpPath)).mode & 0o777, 0o600);
    assert.equal(calls.find((call) => call.command === "ssh" && call.args.at(-1)!.startsWith("project db-export"))!.args.at(-1), "project db-export 'Demo' 'sql.gz'");
    assert.deepEqual(await fs.readdir(path.join(target, ".acli/tmp")), []);
  });
});

test("discoverGit builds an SSH origin and the deployed branch from project status", async () => {
  const status = JSON.stringify({ status: "running:unknown", git_repository: "example-org/demo", git_branch: "prod" });
  const { runner } = fakeRunner({ list: "Demo", status }, {});
  assert.deepEqual(await new CoolifyProjectHost(resolve(), runner).discoverGit(), { directory: ".", url: "git@github.com:example-org/demo.git", branch: "prod" });

  const disabled = resolve({ ...rawProfile, git: { enabled: false } } as Profile);
  assert.equal(await new CoolifyProjectHost(disabled, runner).discoverGit(), null);
});

test("preflight reports a project that is not assigned to the user, and one that is not running", async () => {
  const unassigned = fakeRunner({ list: "Other\nThird" }, {});
  await assert.rejects(() => new NoToolCheckHost(resolve(), unassigned.runner).preflight({}), (error: any) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, "COOLIFY_PROJECT_NOT_FOUND");
    assert.match(error.hint, /Other, Third/);
    return true;
  });

  const stopped = fakeRunner({ list: "Demo", status: JSON.stringify({ status: "exited" }) }, {});
  await assert.rejects(() => new NoToolCheckHost(resolve(), stopped.runner).preflight({}), (error: any) => error.code === "COOLIFY_PROJECT_NOT_RUNNING");

  const running = fakeRunner({ list: "Demo", status: JSON.stringify({ status: "running:unknown" }) }, {});
  await new NoToolCheckHost(resolve(), running.runner).preflight({});
});

test("the server project is found by exact name, else by a unique slug match", async () => {
  const statusFor = fakeRunner({ list: "Other\nAcme Client Site\nBlog", status: JSON.stringify({ status: "running", git_repository: "example-org/acme" }) }, {});
  const host = new NoToolCheckHost(resolve(rawProfile, "acme-client-site"), statusFor.runner);
  await host.preflight({});
  assert.equal(statusFor.calls.find((call) => call.args.at(-1)!.startsWith("project status"))!.args.at(-1), "project status 'Acme Client Site'");
  assert.equal(statusFor.calls.filter((call) => call.args.at(-1) === "project list").length, 1, "project list is looked up once per host");

  const ambiguous = fakeRunner({ list: "Acme_Site\nacme site" }, {});
  await assert.rejects(() => new NoToolCheckHost(resolve(rawProfile, "acme-site"), ambiguous.runner).preflight({}), /matches several server projects/);
});

const DATABASE_MENU = "Databases for project: Demo\n\n  1) ky2690jqn73mdajl8t48tn6r       [mariadb]\n     ky2690jqn73mdajl8t48tn6r\n  2) main-db                        [mariadb]\n     gk6zccy4rbmh5dlbruv9ypnj\n\n";

test("parseSelectionMenu reads the last numbered server menu with its container names", () => {
  assert.deepEqual(parseSelectionMenu(DATABASE_MENU), {
    key: "database",
    what: "database containers",
    options: [{ number: 1, names: ["ky2690jqn73mdajl8t48tn6r", "ky2690jqn73mdajl8t48tn6r"] }, { number: 2, names: ["main-db", "gk6zccy4rbmh5dlbruv9ypnj"] }],
  });
  assert.equal(parseSelectionMenu(`${DATABASE_MENU}Available databases:\n\n  1) default\n  2) other\n`)!.key, "databaseName");
  assert.equal(parseSelectionMenu("Export created:\n  /x"), null);
});

/** A server that stops at the database menu until stdin answers it. */
function menuRunner(exportPath: string, fixture: string) {
  const stdins: string[] = [];
  const runner = (async (command: string, args: string[] = [], options: any = {}) => {
    if (command === "scp") { await fs.copy(fixture, args.at(-1)!); return ""; }
    if (args.at(-1) === "project list") return "Demo";
    stdins.push(options.stdin);
    if (options.stdin !== "2\n") throw Object.assign(new Error("Command failed"), { stdout: DATABASE_MENU, stderr: "" });
    return `${DATABASE_MENU}Export created:\n  ${exportPath}`;
  }) as typeof runCommand;
  return { stdins, runner };
}

test("a database menu without a configured choice stops with an actionable error", async () => {
  const { stdins, runner } = menuRunner("", "");
  await assert.rejects(() => new CoolifyProjectHost(resolve(), runner).exportDatabase("/tmp/unused", null), (error: any) => {
    assert.equal(error.code, "COOLIFY_SELECTION_REQUIRED");
    assert.match(error.message, /ky2690jqn73mdajl8t48tn6r, gk6zccy4rbmh5dlbruv9ypnj/);
    assert.match(error.hint, /selections\.database/);
    return true;
  });
  assert.deepEqual(stdins, [""], "never guesses an answer");
});

test("a remembered database selection answers the menu by name, matching the label or the container name", async () => {
  await withTempDir(async (directory) => {
    const exportPath = "/var/backups/project-databases/demo/demo_1.sql.gz";
    const fixture = path.join(directory, "fixture.sql.gz");
    await fs.writeFile(fixture, gzipSync(`CREATE TABLE \`wp_options\` (id int);\n${"-- padding\n".repeat(20)}`));
    for (const database of ["main-db", "gk6zccy4rbmh5dlbruv9ypnj"]) {
      const target = path.join(directory, database);
      await fs.ensureDir(target);
      const { stdins, runner } = menuRunner(exportPath, fixture);
      await new CoolifyProjectHost(resolve(rawProfile, "Demo", { selections: { database } }), runner).exportDatabase(target, null);
      assert.deepEqual(stdins, ["", "2\n"]);
      assert.ok(await fs.pathExists(path.join(target, "staging.sql")));
    }
    const { runner } = menuRunner(exportPath, fixture);
    await assert.rejects(() => new CoolifyProjectHost(resolve(rawProfile, "Demo", { selections: { database: "missing" } }), runner).exportDatabase(directory, null), (error: any) => error.code === "COOLIFY_SELECTION_NOT_FOUND");
  });
});

test("without a configured choice an interactive run asks once, answers the server, and pauses the spinner", async () => {
  await withTempDir(async (directory) => {
    const WORDPRESS_MENU = "WordPress containers for project: Demo\n\n  1) wordpress\n     wordpress-abc\n  2) wordpress-cron\n     wordpress-def\n\n";
    const stdins: string[] = [];
    const runner = (async (command: string, args: string[] = [], options: any = {}) => {
      if (command === "scp" || command === "tar") return "";
      if (args.at(-1) === "project list") return "Demo";
      stdins.push(options.stdin);
      if (options.stdin !== "1\n") throw Object.assign(new Error("Command failed"), { stdout: WORDPRESS_MENU, stderr: "" });
      return `${WORDPRESS_MENU}WordPress component is not present:\n\nNothing to export.`;
    }) as typeof runCommand;
    const asked: string[] = [];
    const spinnerEvents: string[] = [];
    const host = new CoolifyProjectHost(resolve(), runner, { chooseOption: async (menu) => { asked.push(menu.key); return 1; } });
    const spinner = { message: () => {}, stop: () => spinnerEvents.push("stop"), start: () => spinnerEvents.push("start") };
    await host.syncFiles(path.join(directory, "site"), spinner, { directories: ["uploads", "plugins"] });

    assert.deepEqual(asked, ["wordpressContainer"], "a repeated menu is asked only once per run");
    assert.deepEqual(stdins, ["", "1\n", "", "1\n"]);
    assert.deepEqual(spinnerEvents, ["stop", "start"]);
  });
});

test("import and pull build an interactive Coolify backend unless the run is non-interactive", async () => {
  const seen: (boolean | undefined)[] = [];
  const factory = (profile: any, options: any = {}) => {
    seen.push(options.interactive);
    const host = createRemoteBackend(profile, options);
    assert.equal((host as CoolifyProjectHost).chooseOption !== null, Boolean(options.interactive));
    return { ...host, fileTargets: () => [], preflight: async () => {}, syncFiles: async () => {} } as any;
  };
  const source = createProfileImportSource(factory);
  await source.preflight!({ targetDir: "/tmp/unused", profile: resolve(), nonInteractive: false });
  await source.preflight!({ targetDir: "/tmp/unused", profile: resolve(), nonInteractive: true });
  await new PullService({} as any, factory).pull("/tmp/unused", { profile: resolve(), nonInteractive: false }, ["uploads"], {}, null);
  assert.deepEqual(seen, [true, false, true]);

  // The defaults must forward the options too — a wrapper that drops them
  // silently turned every run non-interactive.
  assert.equal((createRemoteBackend(resolve(), { interactive: true }) as CoolifyProjectHost).chooseOption !== null, true);
});

test("a coolify-cli profile describes only the server; the project comes from the import/link", () => {
  assert.doesNotThrow(() => validateProfileConfig(rawProfile));
  assert.doesNotThrow(() => validateProfileConfig({ ...rawProfile, coolify: { gitHost: "gitlab.example.com" } } as Profile));
  assert.throws(() => validateProfileConfig({ ...rawProfile, coolify: { project: "{projectName}" } } as unknown as Profile), /coolify\.project is no longer part of a profile/);
  assert.throws(() => validateProfileConfig({ ...rawProfile, coolify: { database: "db" } } as unknown as Profile), /coolify\.database is no longer part of a profile/);
  assert.throws(() => validateProfileConfig({ ...rawProfile, provider: "ftp" } as unknown as Profile), /provider must be/);

  assert.equal(resolve().coolify!.project, "Demo", "defaults to the local project name");
  const named = resolve({ ...rawProfile, coolify: { gitHost: "gitlab.example.com" } } as Profile, "acme-client-site", { remoteProject: "Acme Client Site", selections: { database: "main-db" } });
  assert.deepEqual(named.coolify, { project: "Acme Client Site", gitHost: "gitlab.example.com", database: "main-db" });
  assert.throws(() => resolve(rawProfile, "demo", { remoteProject: "demo; rm -rf /" }), /Unsafe server project name/);
});

test("an interactive answer is reported so the project link can remember it", async () => {
  await withTempDir(async (directory) => {
    const exportPath = "/var/backups/project-databases/demo/demo_1.sql.gz";
    const fixture = path.join(directory, "fixture.sql.gz");
    await fs.writeFile(fixture, gzipSync(`CREATE TABLE \`wp_options\` (id int);\n${"-- padding\n".repeat(20)}`));
    const { runner } = menuRunner(exportPath, fixture);
    const remembered: [string, string][] = [];
    const host = new CoolifyProjectHost(resolve(), runner, { chooseOption: async () => 2, onSelection: (key, value) => remembered.push([key, value]) });
    await host.exportDatabase(directory, null);
    assert.deepEqual(remembered, [["database", "gk6zccy4rbmh5dlbruv9ypnj"]]);
  });
});

test("import writes the server project name and remembered answers into the project link", async () => {
  await withTempDir(async (directory) => {
    const source = createProfileImportSource(((profile: any) => createRemoteBackend(profile)) as any);
    const ctx: any = { targetDir: directory, projectName: "acme-client-site", environment: "docker", remoteProject: "Acme Client Site", selections: { database: "main-db" }, profile: { ...resolve(rawProfile, "acme-client-site", { remoteProject: "Acme Client Site" }), profileName: "cloud" } };
    await source.linkProfile!(directory, ctx);
    const link = YAML.parse(await fs.readFile(path.join(directory, ".acli", "config.yaml"), "utf8")).project;
    assert.equal(link.profile, "cloud");
    assert.equal(link.remoteProject, "Acme Client Site");
    assert.deepEqual(link.selections, { database: "main-db" });
  });
});

test("createRemoteBackend picks the backend from the profile provider", () => {
  assert.ok(createRemoteBackend(resolve()) instanceof CoolifyProjectHost);
  const sshProfile = resolveRemoteProfile({ ssh: { host: "h.example.com", username: "u" }, remote: { projectRoot: "/srv/x", wordpressRoot: "wp" }, database: { driver: "wp-cli" } }, { projectName: "x" });
  assert.equal(sshProfile.provider, "ssh");
  assert.ok(createRemoteBackend(sshProfile) instanceof SshHost);
});

test("linkGitRemote tracks a known deployed branch without asking the remote for its default", async () => {
  await withTempDir(async (directory) => {
    const calls: string[][] = [];
    const runner = (async (_command: string, args: string[] = []) => {
      calls.push(args);
      if (args[0] === "remote" && args[1] === "get-url") throw new Error("no origin");
      return "";
    }) as typeof runCommand;
    const result = await linkGitRemote(directory, "git@github.com:example-org/demo.git", runner, { branch: "prod" });
    assert.equal(result.trackingBranch, "prod");
    assert.equal(calls.some((args) => args[0] === "ls-remote"), false);
    assert.ok(calls.some((args) => args.join(" ") === "reset --mixed refs/remotes/origin/prod"));
  });
});
