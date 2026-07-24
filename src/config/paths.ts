import os from "node:os";
import path from "node:path";

const USER_CONFIG_DIR_NAME = "a-cli";
const PROJECT_CONFIG_DIR_NAME = ".acli";

type EnvLike = Record<string, string | undefined>;

export function getUserConfigDir(platform: string = process.platform, env: EnvLike = process.env, home: string = os.homedir()): string {
  if (env.ACLI_CONFIG_HOME) return env.ACLI_CONFIG_HOME;
  if (platform === "win32") return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), USER_CONFIG_DIR_NAME);
  if (platform === "darwin") return path.join(home, "Library", "Application Support", USER_CONFIG_DIR_NAME);
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), USER_CONFIG_DIR_NAME);
}

export function getUserConfigPath(platform: string = process.platform, env: EnvLike = process.env, home: string = os.homedir()): string {
  return path.join(getUserConfigDir(platform, env, home), "config.yaml");
}

export function getUpdateCachePath(platform: string = process.platform, env: EnvLike = process.env, home: string = os.homedir()): string {
  return path.join(getUserConfigDir(platform, env, home), "update.json");
}

// Pre-unification location (`~/.a-cli/update.json`). Kept only as a one-time
// read fallback so upgraders don't lose a same-day cache; new writes always
// go through getUpdateCachePath().
export function getLegacyUpdateCachePath(home: string = os.homedir()): string {
  return path.join(home, ".a-cli", "update.json");
}

export function getProjectConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, PROJECT_CONFIG_DIR_NAME);
}

export function getProjectConfigPath(cwd: string = process.cwd()): string {
  return path.join(getProjectConfigDir(cwd), "config.yaml");
}
