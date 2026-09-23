import path from "node:path";
import { isObject } from "../../core/objects.ts";
import { SshHost } from "./SshHost.ts";
import type { ProviderDefinition } from "../contract.ts";

/** Direct SSH access: files with rsync, the database with wp-cli on the server. */
export const sshProvider: ProviderDefinition = {
  name: "ssh",
  profileKeys: ["remote", "files"],

  validate(profile, label, errors) {
    if (!profile.remote?.projectRoot) errors.push(`${label}: remote.projectRoot is required.`);
    if (!profile.remote?.wordpressRoot) errors.push(`${label}: remote.wordpressRoot is required.`);
    const files = profile.files as Record<string, unknown> | undefined;
    if (files?.transport !== undefined && files.transport !== "rsync") errors.push(`${label}: files.transport "${files.transport}" is no longer supported; the ssh provider syncs files with rsync (remove the field).`);
    if (profile.files?.targets !== undefined) validateFileTargets(profile.files.targets, `${label}.files.targets`, errors);
    const database = profile.database as Record<string, unknown> | undefined;
    if (database?.driver !== undefined && database.driver !== "wp-cli") errors.push(`${label}: database.driver "${database.driver}" is no longer supported; the ssh provider exports the database with wp-cli on the server (remove the field).`);
  },

  resolve(profile, render) {
    if (!profile.remote) throw new Error("Profile field \"remote\" is required for the ssh provider.");
    const projectRoot = render(profile.remote.projectRoot);
    return { remote: { ...profile.remote, projectRoot, wordpressRoot: path.posix.join(projectRoot, render(profile.remote.wordpressRoot)) } };
  },

  tools: () => ["ssh", "rsync"],

  describe: () => "SSH · wp-cli · rsync",

  summary: (profile) => [`WordPress: ${profile.remote?.projectRoot}/${profile.remote?.wordpressRoot}`, "Database: wp-cli export over SSH", "Files: rsync"],

  plan(profile, ctx) {
    return {
      remoteWordPressRoot: profile.remote.wordpressRoot,
      databaseDriver: ctx.skipDatabase ? "skipped" : "wp-cli",
      fileTransfer: ctx.skipFiles ? "skipped" : "rsync",
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
