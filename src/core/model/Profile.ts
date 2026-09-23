/**
 * Answers to the server `project` CLI's "which one?" menus, by name as the
 * menu prints it — needed when a project has more than one WordPress or
 * database container, or more than one database in its container.
 */
export interface CoolifySelection {
  /** Database container: the name shown in the menu, or the container name under it. */
  database?: string;
  /** Database inside that container, when it holds more than one. */
  databaseName?: string;
  /** WordPress container: the service name shown in the menu, or the container name. */
  wordpressContainer?: string;
}

/**
 * A profile as authored in config: names, template placeholders (`{projectName}`),
 * and possibly-unresolved secret references (`${ENV_VAR}` / `{command: "..."}`).
 * Not safe to use for connections directly — pass it through
 * `resolveRemoteProfile()` first.
 */
export interface Profile {
  /** Defaults to "wordpress" when absent — see config/schema.ts's validateProfileConfig. The only value it may currently hold. */
  type?: "wordpress";
  profileName?: string;
  /**
   * How A-CLI reaches the remote site. "ssh" (the default) means direct SSH
   * access to the WordPress files and database. "coolify-cli" means the
   * server only exposes the `project` CLI (Coolify staging) — `remote` and
   * `database` are then not used, and `coolify` is required instead.
   */
  provider?: "ssh" | "coolify-cli";
  coolify?: {
    /** Project name as `project list` prints it on the server. May use `{projectName}`. */
    project: string;
    /** Host used to turn `project status`'s `owner/repo` into an SSH Git URL. Defaults to github.com. */
    gitHost?: string;
  } & CoolifySelection;
  ssh: {
    host: string;
    port?: number | string;
    username: string;
    identityFile?: string;
    hostKeyPolicy?: "strict" | "accept-new" | "insecure";
  };
  /** Required for the "ssh" provider; unused by "coolify-cli". */
  remote?: {
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
   * authored as free-form YAML and the databaseCommand module is
   * the single place that actually interprets it per driver.
   * Required for the "ssh" provider; "coolify-cli" reads only `tablePrefix`
   * and `normalizeCollations` from it.
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
    /** Local ~/.ssh/config Host alias used only when fetching an SSH Git origin. */
    sshHostAlias?: string;
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
  provider: "ssh" | "coolify-cli";
  /** Present only for the "coolify-cli" provider, with `project` already rendered. */
  coolify?: { project: string; gitHost: string } & CoolifySelection;
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
