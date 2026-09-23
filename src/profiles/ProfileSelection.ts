import { confirm, select } from "@clack/prompts";
import { ask } from "../ui/prompts.ts";
import { loadConfig } from "../config/ConfigLoader.ts";
import { loadProfile } from "./loadProfile.ts";
import { createProfileCommand } from "./ProfileBuilder.ts";
import { CliError, MissingOptionError } from "../core/errors.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";
import { getProvider } from "../providers/registry.ts";
import { describeProfile } from "./ProfileQuery.ts";

export interface ResolveProfileSelectionParams {
  config: AcliConfig;
  options?: { profile?: string; config?: string };
  attachedProfileName?: string;
  required?: boolean;
  nonInteractive?: boolean;
  offerCreateWhenMissing?: boolean;
  configuredOnly?: boolean;
  chooseProfile?: (names: string[], config: AcliConfig) => Promise<string>;
}

export interface ResolveProfileSelectionResult {
  config: AcliConfig;
  profileName: string | undefined;
  profile: (Profile & { profileName: string; profilePath?: string }) | null;
}

/**
 * Resolves which profile a flow should use: an explicit --profile flag, one
 * already attached to the context, the default set with `acli profile use`,
 * the sole available profile, an
 * interactive pick among several, or (interactively, with none yet defined)
 * optionally offering to create one on the spot. `acli link` keeps that
 * convenience; `acli import` disables it and requires an already-configured
 * named profile.
 */
export async function resolveProfileSelection({ config, options = {}, attachedProfileName, required, nonInteractive, offerCreateWhenMissing = true, configuredOnly = false, chooseProfile }: ResolveProfileSelectionParams): Promise<ResolveProfileSelectionResult> {
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
      hint: "Run `acli profile list` to see the configured profiles, or `acli profile create` to add one.",
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

  // `acli profile use` stores defaults.profile; honor it (when it still names
  // a configured profile) before falling back to a sole profile or a picker.
  const defaultProfile = typeof config.defaults?.profile === "string" && config.profiles?.[config.defaults.profile] ? config.defaults.profile : undefined;
  let profileName = options.profile || attachedProfileName || (required ? defaultProfile : undefined) || (required && availableProfiles.length === 1 ? availableProfiles[0] : undefined);
  if (required && !profileName && availableProfiles.length > 1 && !nonInteractive) {
    profileName = chooseProfile
      ? await chooseProfile(availableProfiles, config)
      : (await ask(select, { message: "Which staging environment should be used?", options: availableProfiles.map((name) => profileOption(name, config.profiles![name]!)) })) as string;
  }

  if (required && !profileName && availableProfiles.length > 1 && nonInteractive) {
    throw new MissingOptionError(["--profile <name>"], { hint: `Choose one of: ${availableProfiles.join(", ")}.` });
  }
  const profile = loadProfile(profileName, config);
  if (required && !profile) throw new Error("This workflow requires a profile. Run `acli profile create` or pass --profile.");
  return { config, profileName, profile };
}

export function profileOption(name: string, profile: Profile): { label: string; value: string } {
  return { label: `${name} — ${describeProfile(profile)}`, value: name };
}

/**
 * The "Selected profile" note. Once the project name is known, `{projectName}`
 * placeholders are shown filled in, so the summary reads as the actual
 * server user, project and paths this run will use.
 */
export function profileSummary(profile: Profile, environment: string | undefined, projectName?: string): string {
  const summary = [`Remote: ${profile.ssh.username}@${profile.ssh.host}`, ...(getProvider(profile)?.summary(profile) || []), `Local: ${environment}`].join("\n");
  return projectName ? summary.replaceAll("{projectName}", projectName) : summary;
}
