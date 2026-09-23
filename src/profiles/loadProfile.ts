import type { AcliConfig } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";

/**
 * Looks up a profile by name in the loaded configuration. Returns the raw,
 * *unresolved* profile: template placeholders and remote paths are still
 * unsubstituted. Pass it through `resolveRemoteProfile()` before connecting.
 */
export function loadProfile(profileName: string | undefined, config: Pick<AcliConfig, "profiles"> = { profiles: {} }): (Profile & { profileName: string }) | null {
  if (!profileName) return null;
  const profile = config.profiles?.[profileName];
  if (!profile) throw new Error(`Profile "${profileName}" was not found. Run \`acli profile list\` to see the configured profiles.`);
  return { ...profile, profileName };
}
