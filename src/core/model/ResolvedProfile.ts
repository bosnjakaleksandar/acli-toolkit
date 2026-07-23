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
  /**
   * Which fields matter depends on `driver`: wp-cli needs nothing further;
   * docker needs either `discovery: "container-name"` (+ containerPattern/
   * executable/envFile/userEnv/passwordEnv/nameEnv) or service/composeFile/
   * executable; direct needs host/port/user/password/name. Kept as one
   * loosely-typed object (rather than a driver-keyed union) because it's
   * authored as free-form YAML and RemoteProfileService.databaseCommand is
   * the single place that actually interprets it per driver.
   */
  database: {
    driver: "wp-cli" | "docker" | "direct";
    normalizeCollations?: boolean;
    tablePrefix?: string;
    executable?: string;
    discovery?: "container-name";
    containerPattern?: string;
    envFile?: string;
    userEnv?: string;
    passwordEnv?: string;
    nameEnv?: string;
    service?: string;
    composeFile?: string;
    host?: string;
    port?: number | string;
    user?: string;
    password?: string;
    name?: string;
  };
  git?: {
    enabled?: boolean;
    includeProjectRoot?: boolean;
    discoveryPaths?: string[];
  };
  urls?: {
    staging?: string;
    local?: string;
    additionalSearchReplace?: string[];
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
