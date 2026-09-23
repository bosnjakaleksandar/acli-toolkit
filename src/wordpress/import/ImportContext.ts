import type { CoolifySelection, ResolvedProfile } from "../../core/model/Profile.ts";

/**
 * Everything one `acli import` run knows: what the user asked for, the
 * resolved profile (the server), and what earlier steps found out
 * (table prefix, Git status, prompt answers). Built by the import command,
 * then read and filled in by the workflow's steps.
 */
// A type alias (not an interface) so it stays assignable to the shared
// ProjectPlan shape that environment/next-step helpers accept.
export type ImportContext = {
  targetDir: string;
  /** Local project (and folder) name. */
  projectName: string;
  environment: "docker" | "lando";
  profile: ResolvedProfile;
  appType: "wordpress";
  setupType: "existing-wp";
  projectType: "wp-existing";
  mysqlVersion: string;
  wpVersion: string;
  /** An extra URL to search-replace (from --remote-url or the profile's urls.staging). */
  stagingUrl?: string;
  skipFiles?: boolean;
  skipDatabase?: boolean;
  skipGitLink?: boolean;
  skipGitInit?: boolean;
  keepDump?: boolean;
  nonInteractive?: boolean;
  /** The project's name on the server, when it differs from projectName. */
  remoteProject?: string;
  /** Server prompt answers given during this run, remembered in the project link. */
  selections?: CoolifySelection;
  /** Detected by the workflow, templated into the local environment. */
  tablePrefix?: string;
  /** Git link result shown in the success summary. */
  gitStatus?: string;
  warnings?: string[];
  dependenciesInstalled?: boolean;
};
