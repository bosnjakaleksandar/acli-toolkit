import { isObject } from "../config/schema.ts";
import type { Profile } from "../core/model/Profile.ts";

const DEFAULT_FILE_TARGET_NAMES = ["uploads", "plugins", "themes"];

/**
 * Converts a profile's legacy `files.directories`/`files.excludes` shape
 * into the newer `files.targets` map (name -> {path, excludes, includes}).
 * Profiles already written in the new shape pass through untouched. This is
 * the single place callers should normalize through — everything downstream
 * (RemoteHost.syncFiles, PullService) consumes only `targets`.
 */
export function normalizeProfile(profile: Profile): Profile {
  if (!isObject(profile)) return profile;
  const files = (profile.files || {}) as Record<string, unknown>;
  if (files.targets) return profile;
  const names = (files.directories as string[]) || DEFAULT_FILE_TARGET_NAMES;
  const excludes = (files.excludes as string[]) || ["*.log", "node_modules"];
  const includes = (files.includes as string[]) || [];
  const targets = Object.fromEntries(names.map((name) => [name, { path: `wp-content/${name}`, excludes, includes }]));
  return { ...profile, files: { ...files, targets } } as Profile;
}
