import { confirm, select } from "@clack/prompts";
import { ask } from "../ui/prompts.ts";
import { loadConfig } from "../config/ConfigLoader.ts";
import { loadProfile } from "./loadProfile.ts";
import { createProfileCommand } from "./ProfileBuilder.ts";
import { CliError, MissingOptionError } from "../core/errors.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";

export interface ResolveProfileSelectionParams {
  config: AcliConfig;
  options?: { profile?: string; config?: string };
  attachedProfileName?: string;
  required?: boolean;
  nonInteractive?: boolean;
  offerCreateWhenMissing?: boolean;
  configuredOnly?: boolean;
  chooseProfile?: (names: string[], config: AcliConfig) => Promise<string>;
  commandRunner?: (command: string) => string;
}

export interface ResolveProfileSelectionResult {
  config: AcliConfig;
  profileName: string | undefined;
  profile: (Profile & { profileName: string; profilePath?: string }) | null;
}

/**
 * Resolves which profile a flow should use: an explicit --profile flag, one
 * already attached to the context, the sole available profile, an
 * interactive pick among several, or (interactively, with none yet defined)
 * optionally offering to create one on the spot. `acli link` keeps that
 * convenience; `acli import` disables it and requires an already-configured
 * named profile.
 */
export async function resolveProfileSelection({ config, options = {}, attachedProfileName, required, nonInteractive, offerCreateWhenMissing = true, configuredOnly = false, chooseProfile, commandRunner }: ResolveProfileSelectionParams): Promise<ResolveProfileSelectionResult> {
  let availableProfiles = Object.keys(config.profiles || {});
  if (required && configuredOnly && availableProfiles.length === 0) {
    throw new CliError("No staging profiles are configured.", {
      code: "PROFILE_REQUIRED",
      hint: "Run `acli profile create`, or choose Profiles from the main menu, before importing.",
    });
  }
  if (configuredOnly && options.profile && !config.profiles?.[options.profile]) {
    throw new CliError(`Profile "${options.profile}" is not configured.`, {
      code: "PROFILE_NOT_FOUND",
      hint: "Choose a configured profile, or save a portable YAML first with `acli profile import <path>`.",
    });
  }
  if (required && offerCreateWhenMissing && !options.profile && !attachedProfileName && !availableProfiles.length && !nonInteractive) {
    const createNow = await ask(confirm, { message: "No staging profiles were found. Create one now?", initialValue: true });
    if (!createNow) throw new Error("This workflow requires a staging profile.");
    const created = await createProfileCommand(undefined, { config: options.config });
    ({ config } = await loadConfig({ configPath: options.config }));
    attachedProfileName = created.name;
    availableProfiles = Object.keys(config.profiles || {});
  }

  let profileName = options.profile || attachedProfileName || (required && availableProfiles.length === 1 ? availableProfiles[0] : undefined);
  if (required && !profileName && availableProfiles.length > 1 && !nonInteractive) {
    profileName = chooseProfile
      ? await chooseProfile(availableProfiles, config)
      : (await ask(select, { message: "Which staging environment should be used?", options: availableProfiles.map((name) => profileOption(name, config.profiles![name]!)) })) as string;
  }

  if (required && !profileName && availableProfiles.length > 1 && nonInteractive) {
    throw new MissingOptionError(["--profile <name>"], { hint: `Choose one of: ${availableProfiles.join(", ")}.` });
  }
  const profile = await loadProfile(profileName, config, process.cwd(), commandRunner ? { commandRunner } : {});
  if (required && !profile) throw new Error("This workflow requires a profile. Run `acli profile create` or pass --profile.");
  return { config, profileName, profile };
}

export function profileOption(name: string, profile: Profile): { label: string; value: string } {
  const host = profile.ssh?.host || "unknown host";
  const database = profile.database?.driver || "unknown DB";
  return { label: `${name} — ${host} · ${database} · ${profile.files?.transport || "rsync"}`, value: name };
}

export function profileSummary(profile: Profile, environment: string | undefined): string {
  const dump = profile.database?.executable === "auto" ? "MariaDB/MySQL auto-detect" : profile.database?.driver;
  return [`Remote: ${profile.ssh.username}@${profile.ssh.host}`, `WordPress: ${profile.remote.projectRoot}/${profile.remote.wordpressRoot}`, `Database: ${dump}`, `Files: ${profile.files?.transport || "rsync"}`, `Local: ${environment}`].join("\n");
}
