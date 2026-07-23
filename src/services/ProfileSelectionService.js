import { confirm, select } from "@clack/prompts";
import { ask } from "../utils/prompts.js";
import { loadConfig } from "./ConfigService.js";
import { loadProfile } from "./PresetService.js";
import { createProfileCommand } from "../commands/profile.js";

/**
 * Resolves which profile a flow should use: an explicit --profile flag, one
 * already attached to the context, the sole available profile, an
 * interactive pick among several, or (interactively, with none yet defined)
 * offering to create one on the spot. Shared by `acli create` (existing-wp)
 * and `acli link`, which both need "pick or create a profile" but otherwise
 * have unrelated flows.
 *
 * @param {object} params
 * @param {object} params.config Loaded layered config.
 * @param {{profile?: string, config?: string}} params.options CLI options (needs at least --profile/--config).
 * @param {string|undefined} params.attachedProfileName A profile name already implied by context (e.g. ctx.profile), if any.
 * @param {boolean} params.required Whether a profile is mandatory for this flow.
 * @param {boolean} params.nonInteractive Whether prompts are disallowed.
 * @returns {Promise<{config: object, profileName: string|undefined, profile: object|null}>}
 */
export async function resolveProfileSelection({ config, options = {}, attachedProfileName, required, nonInteractive }) {
  if (required && !options.profile && !attachedProfileName && !Object.keys(config.profiles || {}).length && !nonInteractive) {
    const createNow = await ask(confirm, { message: "No staging profiles were found. Create one now?", initialValue: true });
    if (!createNow) throw new Error("This workflow requires a staging profile.");
    const created = await createProfileCommand(undefined, { config: options.config });
    ({ config } = await loadConfig({ configPath: options.config }));
    attachedProfileName = created.name;
  }

  const availableProfiles = Object.keys(config.profiles || {});
  let profileName = options.profile || attachedProfileName || (required && availableProfiles.length === 1 ? availableProfiles[0] : undefined);
  if (required && !profileName && availableProfiles.length > 1 && !nonInteractive) {
    profileName = await ask(select, { message: "Which staging environment should be used?", options: availableProfiles.map((name) => profileOption(name, config.profiles[name])) });
  }

  const profile = await loadProfile(profileName, config);
  if (required && !profile) throw new Error("This workflow requires a profile. Run `acli profile create` or pass --profile.");
  return { config, profileName, profile };
}

export function profileOption(name, profile) {
  const host = profile.ssh?.host || "unknown host";
  const database = profile.database?.driver || "unknown DB";
  return { label: `${name} — ${host} · ${database} · ${profile.files?.transport || "rsync"}`, value: name };
}

export function profileSummary(profile, environment) {
  const dump = profile.database?.executable === "auto" ? "MariaDB/MySQL auto-detect" : profile.database?.driver;
  return [`Remote: ${profile.ssh.username}@${profile.ssh.host}`, `WordPress: ${profile.remote.projectRoot}/${profile.remote.wordpressRoot}`, `Database: ${dump}`, `Files: ${profile.files?.transport || "rsync"}`, `Local: ${environment}`].join("\n");
}
