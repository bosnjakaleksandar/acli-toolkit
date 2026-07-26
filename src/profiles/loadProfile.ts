import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { resolveReferences } from "../config/references.ts";
import { validateProfileConfig } from "../config/schema.ts";
import type { AcliConfig } from "../core/model/AcliConfig.ts";
import type { Profile } from "../core/model/Profile.ts";

/**
 * Resolves a profile by name from the loaded configuration, or — when the
 * name doesn't match a configured profile — as a path to a portable profile
 * YAML file (e.g. one produced by `acli profile export`). Returns the raw,
 * *unresolved* profile: template placeholders and remote paths are still
 * unsubstituted. Pass it through `resolveRemoteProfile()` before connecting.
 */
export async function loadProfile(profileName: string | undefined, config: Pick<AcliConfig, "profiles"> = { profiles: {} }, cwd = process.cwd()): Promise<(Profile & { profileName: string; profilePath?: string }) | null> {
  if (!profileName) return null;
  if (config.profiles?.[profileName]) return { ...config.profiles[profileName]!, profileName };
  const profilePath = path.resolve(cwd, profileName);
  if (!(await fs.pathExists(profilePath))) throw new Error(`Profile "${profileName}" was not found in configuration or at ${profilePath}.`);
  const document = YAML.parse(await fs.readFile(profilePath, "utf8"));
  const profile = document?.profile || document?.profiles?.[profileName] || document;
  validateProfileConfig(profile, `profile ${profilePath}`);
  return { ...(resolveReferences(profile) as Profile), profileName, profilePath };
}
