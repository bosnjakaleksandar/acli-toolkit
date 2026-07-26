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

// Matches a URL-scheme remote's userinfo segment (everything between "://"
// and the next "@"), capturing the scheme and the userinfo separately.
const URL_USERINFO = /^([a-z][a-z0-9+.-]*):\/\/([^/@\s]+)@/i;

/**
 * True if `url` embeds credentials in its userinfo segment (`scheme://userinfo@host/...`).
 * For http(s)/git/file, *any* userinfo is treated as a credential and
 * rejected — a bare username has no legitimate meaning for those schemes,
 * and this is exactly how tokens are commonly smuggled into a URL (e.g.
 * `https://<token>@github.com/...` or `https://x-access-token:<token>@...`).
 * For ssh, a bare `user@host` is the ordinary, legitimate way to name which
 * remote account to connect as (the same thing the SCP-like `user@host:path`
 * form below allows) — only a `user:password@host` (a literal password) is
 * rejected for that scheme.
 */
export function hasUrlCredentials(url: string): boolean {
  const match = URL_USERINFO.exec(url.trim());
  if (!match) return false;
  const scheme = match[1]!.toLowerCase();
  const userinfo = match[2]!;
  return scheme === "ssh" ? userinfo.includes(":") : true;
}

/**
 * True for a git remote URL/spec that's safe to pass as a bare positional
 * argument to `git clone`/`git remote add`. Rejects any value starting with
 * "-" (git would parse it as an option rather than a URL/path), any value
 * embedding credentials (see hasUrlCredentials), and anything outside the
 * recognized URL/SCP-like/local-path shapes.
 */
export function isSafeGitUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value || value.startsWith("-")) return false;
  if (hasUrlCredentials(value)) return false;
  return URL_SCHEME_GIT_URL.test(value) || SCP_LIKE_GIT_URL.test(value) || SAFE_LOCAL_GIT_PATH.test(value);
}

/**
 * Best-effort masking of credential-bearing URL userinfo (`scheme://user:pass@host`
 * → `scheme://***@host`) wherever it appears inside free-form text — spinner
 * messages, error text, verbose command logs — so a URL that reached one of
 * those sites before (or despite) an isSafeGitUrl check never reproduces a
 * live credential in A-CLI's own output. Not a substitute for isSafeGitUrl's
 * rejection: a token in a URL also ends up in `.git/config` and shell
 * history regardless of what A-CLI prints.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1***@");
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

// The environment adapters template mysqlVersion/wpVersion/tablePrefix into
// generated YAML via a raw string replace, with no YAML-aware escaping. A
// value containing a newline (or other YAML-structural characters) would
// inject arbitrary keys into docker-compose.yaml/.lando.yml. These three
// values only ever need to express a version tag ("8.0", "latest",
// "mariadb:11.4") or a SQL identifier prefix — restricting them to that
// shape closes the injection off at the source.
const SAFE_VERSION_STRING = /^[a-zA-Z0-9_.:-]+$/;
const SAFE_TABLE_PREFIX = /^[A-Za-z0-9_]+$/;

/** Returns `value` if it is a bare version tag, else throws naming the offending field. */
export function assertSafeVersionString(value: string, label: string): string {
  if (typeof value !== "string" || !SAFE_VERSION_STRING.test(value)) {
    throw new Error(`Unsafe ${label} value: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertSafeWpVersion(wpVersion: string): string {
  return assertSafeVersionString(wpVersion, "wpVersion");
}

export function assertSafeTablePrefix(tablePrefix: string): string {
  if (typeof tablePrefix !== "string" || !SAFE_TABLE_PREFIX.test(tablePrefix)) {
    throw new Error(`Unsafe database table prefix: ${JSON.stringify(tablePrefix)}`);
  }
  return tablePrefix;
}
