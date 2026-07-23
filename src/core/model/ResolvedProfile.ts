/**
 * A profile as authored in config: names, template placeholders (`{projectName}`),
 * and possibly-unresolved secret references (`${ENV_VAR}` / `{command: "..."}`).
 * Not safe to use for connections directly — pass it through
 * `resolveRemoteProfile()` first.
 */
export interface Profile {
  profileName?: string;
  ssh: {
    host: string;
    port?: number | string;
    username: string;
    identityFile?: string;
    hostKeyPolicy?: "strict" | "accept-new" | "insecure";
  };
  remote: {
    projectRoot: string;
    wordpressRoot: string;
  };
  files?: {
    transport?: "rsync" | "sftp";
    directories?: string[];
    excludes?: string[];
    includes?: string[];
    targets?: Record<string, { path: string; excludes?: string[]; includes?: string[] }>;
  };
  database: {
    driver: "wp-cli" | "docker" | "direct";
    normalizeCollations?: boolean;
  };
  git?: {
    enabled?: boolean;
  };
  urls?: {
    staging?: string;
    local?: string;
  };
  local?: Record<string, unknown>;
}

/**
 * The output of `resolveRemoteProfile()`: template placeholders substituted,
 * secrets resolved, paths joined. Deliberately a distinct type from `Profile`
 * (not a subtype with optional-narrowing) so that passing an already-resolved
 * profile back into the resolver — the "resolve exactly once" hazard the
 * original code only guarded against with a comment — is a compile error
 * instead of a silent double-join of remote paths.
 */
export interface ResolvedProfile {
  readonly __resolved: true;
  profileName?: string;
  projectName: string;
  ssh: {
    host: string;
    port: number;
    username: string;
    identityFile: string;
    hostKeyPolicy: "strict" | "accept-new" | "insecure";
  };
  remote: {
    projectRoot: string;
    wordpressRoot: string;
  };
  files?: Profile["files"];
  database: Profile["database"];
  git?: Profile["git"];
  urls?: Profile["urls"];
  local?: Record<string, unknown>;
}
