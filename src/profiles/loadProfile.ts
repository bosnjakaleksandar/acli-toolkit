import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { findSecretReferencePath, resolveReferences } from "../config/references.ts";
import { isConfigTrusted } from "../config/TrustStore.ts";
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
export interface LoadProfileOptions {
  env?: Record<string, string | undefined>;
  commandRunner?: (command: string) => string;
}

interface ResolveProfileReferenceOptions extends LoadProfileOptions {
  sourcePath?: string;
  sourceText?: string;
}

export async function resolveProfileReferences(
  profile: Profile,
  { env = process.env, commandRunner, sourcePath, sourceText }: ResolveProfileReferenceOptions = {},
): Promise<Profile> {
  const secretPath = findSecretReferencePath(profile);
  if (secretPath && sourcePath) {
    const rawText = sourceText ?? await fs.readFile(sourcePath, "utf8");
    const trusted = env.ACLI_TRUST_PROJECT_CONFIG === "1" || (await isConfigTrusted(sourcePath, rawText, env));
    if (!trusted) {
      throw new Error(
        `Refusing to resolve secrets from profile source ${sourcePath}: it declares a secret command or environment-variable reference at "${secretPath}".\n` +
          `Trust this exact file with "acli config trust --config ${sourcePath}" before using it, or set ACLI_TRUST_PROJECT_CONFIG=1 to bypass this check for a single command.`,
      );
    }
  }
  return resolveReferences(profile, { env, ...(commandRunner ? { commandRunner } : {}) }) as Profile;
}

export async function loadProfile(
  profileName: string | undefined,
  config: Pick<AcliConfig, "profiles"> = { profiles: {} },
  cwd = process.cwd(),
  { env = process.env, commandRunner }: LoadProfileOptions = {},
): Promise<(Profile & { profileName: string; profilePath?: string }) | null> {
  if (!profileName) return null;
  if (config.profiles?.[profileName]) {
    return { ...(await resolveProfileReferences(config.profiles[profileName], { env, commandRunner })), profileName };
  }
  const profilePath = path.resolve(cwd, profileName);
  if (!(await fs.pathExists(profilePath))) throw new Error(`Profile "${profileName}" was not found in configuration or at ${profilePath}.`);
  const rawText = await fs.readFile(profilePath, "utf8");
  const document = YAML.parse(rawText);
  const profile = document?.profile || document?.profiles?.[profileName] || document;
  validateProfileConfig(profile, `profile ${profilePath}`);
  return { ...(await resolveProfileReferences(profile, { env, commandRunner, sourcePath: profilePath, sourceText: rawText })), profileName, profilePath };
}
