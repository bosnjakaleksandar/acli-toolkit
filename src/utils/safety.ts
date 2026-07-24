// Shared input-safety checks for values that end up as git positionals, ssh
// argv elements, or shell-interpreted strings (GIT_SSH_COMMAND). Centralized
// here so every call site applies the same rules rather than re-deriving
// them ad hoc.

const SCP_LIKE_GIT_URL = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:.+$/;
const URL_SCHEME_GIT_URL = /^(https?|git|ssh|file):\/\/\S+$/i;
// No colon allowed, so git's `ext::<command>`/`fd::<command>` remote-helper
// syntax (a documented RCE vector — the "URL" is actually a shell command
// git will run) can never match this, on top of excluding every other shell
// metacharacter. `git clone <local-path>` is common and legitimate, so
// plain relative/absolute filesystem paths are accepted here too.
const SAFE_LOCAL_GIT_PATH = /^[a-zA-Z0-9._/~-]+$/;

/**
 * True for a git remote URL/spec that's safe to pass as a bare positional
 * argument to `git clone`/`git remote add`. Rejects any value starting with
 * "-" (git would parse it as an option rather than a URL/path) and anything
 * outside the recognized URL/SCP-like/local-path shapes.
 */
export function isSafeGitUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value || value.startsWith("-")) return false;
  return URL_SCHEME_GIT_URL.test(value) || SCP_LIKE_GIT_URL.test(value) || SAFE_LOCAL_GIT_PATH.test(value);
}

const SAFE_SSH_KEY_PATH = /^[a-zA-Z0-9._/~-]+$/;

/**
 * True for a filesystem path safe to interpolate, unquoted, into a
 * shell-interpreted string (GIT_SSH_COMMAND, rsync's -e transport). No
 * spaces, quotes, or shell metacharacters, and no leading "-" (which ssh
 * would parse as an option rather than the intended `-i <path>` argument).
 */
export function isSafeSshKeyPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("-") && SAFE_SSH_KEY_PATH.test(value);
}

const PLUGIN_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for a string matching WordPress.org's plugin slug grammar (lowercase letters, digits, single hyphens). Used before a plugin name is written into a generated, executable shell script. */
export function isSafePluginSlug(value: unknown): value is string {
  return typeof value === "string" && PLUGIN_SLUG.test(value);
}
