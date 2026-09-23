import path from "node:path";
import { isObject, isValidPort } from "../../core/objects.ts";
import { SshHost } from "./SshHost.ts";
import type { ProviderDefinition } from "../contract.ts";

const DB_DRIVERS = new Set(["wp-cli", "docker", "direct"]);
const FILE_TRANSPORTS = new Set(["rsync", "sftp"]);

/** Direct SSH access to the WordPress files and database. */
export const sshProvider: ProviderDefinition = {
  name: "ssh",
  profileKeys: ["remote", "files"],

  validate(profile, label, errors) {
    if (!profile.remote?.projectRoot) errors.push(`${label}: remote.projectRoot is required.`);
    if (!profile.remote?.wordpressRoot) errors.push(`${label}: remote.wordpressRoot is required.`);
    const transport = profile.files?.transport || "rsync";
    if (!FILE_TRANSPORTS.has(transport)) errors.push(`${label}: files.transport must be rsync or sftp.`);
    if (profile.files?.targets !== undefined) validateFileTargets(profile.files.targets, `${label}.files.targets`, errors);
    if (!DB_DRIVERS.has(profile.database?.driver)) errors.push(`${label}: database.driver must be wp-cli, docker, or direct.`);
    if (profile.database?.port !== undefined && !isValidPort(profile.database.port)) errors.push(`${label}: database.port must be an integer from 1 to 65535.`);
  },

  resolve(profile, render) {
    if (!profile.remote) throw new Error("Profile field \"remote\" is required for the ssh provider.");
    const projectRoot = render(profile.remote.projectRoot);
    return { remote: { ...profile.remote, projectRoot, wordpressRoot: path.posix.join(projectRoot, render(profile.remote.wordpressRoot)) } };
  },

  tools(profile) {
    return ["ssh", profile.files?.transport === "sftp" ? "scp" : "rsync"];
  },

  describe(profile) {
    return `${profile.database?.executable === "auto" ? "MariaDB/MySQL" : profile.database?.driver || "unknown DB"} · ${profile.files?.transport || "rsync"}`;
  },

  summary(profile) {
    const dump = profile.database?.executable === "auto" ? "MariaDB/MySQL auto-detect" : profile.database?.driver;
    return [`WordPress: ${profile.remote?.projectRoot}/${profile.remote?.wordpressRoot}`, `Database: ${dump}`, `Files: ${profile.files?.transport || "rsync"}`];
  },

  plan(profile, ctx) {
    return {
      remoteWordPressRoot: profile.remote.wordpressRoot,
      databaseDriver: ctx.skipDatabase ? "skipped" : profile.database.driver,
      fileTransfer: ctx.skipFiles ? "skipped" : profile.files?.transport || "rsync",
    };
  },

  fingerprint: (profile) => profile,

  create: (profile, runner) => new SshHost(profile, runner),
};

function validateFileTargets(targets: Record<string, { path: string }>, label: string, errors: string[]): void {
  if (!isObject(targets)) { errors.push(`${label} must be a mapping.`); return; }
  for (const [name, target] of Object.entries(targets)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { errors.push(`${label}: unsafe target name "${name}".`); continue; }
    if (!isObject(target) || typeof target.path !== "string") { errors.push(`${label}.${name}: path is required.`); continue; }
    if (!isSafeRelativePath(target.path)) errors.push(`${label}.${name}.path: must be a safe relative path (no absolute paths or "..").`);
  }
}

function isSafeRelativePath(value: string): boolean {
  return /^[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..") && !path.posix.isAbsolute(value);
}
