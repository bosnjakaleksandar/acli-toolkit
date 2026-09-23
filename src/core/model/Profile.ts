/**
 * Answers to the server `project` CLI's "which one?" menus, by name as the
 * menu prints it — needed when a project has more than one WordPress or
 * database container, or more than one database in its container. Stored
 * per project, in its link (see ProjectLink.selections).
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
  /** coolify-cli provider only. Which project on the server is chosen per import, not here. */
  coolify?: {
    /** Host used to turn `project status`'s `owner/repo` into an SSH Git URL. Defaults to github.com. */
    gitHost?: string;
  };
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
  /** ssh provider only: which wp-content directories to rsync. */
  files?: {
    directories?: string[];
    excludes?: string[];
    includes?: string[];
    targets?: Record<string, { path: string; excludes?: string[]; includes?: string[] }>;
  };
  /**
   * Optional overrides for the imported database. The ssh provider always
   * exports with wp-cli; `driver: wp-cli` is still accepted from older
   * profiles but has no effect.
   */
  database?: {
    driver?: "wp-cli";
    normalizeCollations?: boolean;
    tablePrefix?: string;
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
  /** Present only for the "coolify-cli" provider: the server project for this run and its remembered selections. */
  coolify?: { project: string; gitHost: string } & CoolifySelection;
  ssh: {
    host: string;
    port: number;
    username: string;
    identityFile: string;
    hostKeyPolicy: "strict" | "accept-new" | "insecure";
  };
  /** ssh provider only: absolute remote paths, already joined. */
  remote?: {
    projectRoot: string;
    wordpressRoot: string;
  };
  /** ssh provider only: normalized into `targets`. */
  files?: Profile["files"];
  database: NonNullable<Profile["database"]>;
  git?: Profile["git"];
  urls?: Profile["urls"];
  local?: Record<string, unknown>;
}
