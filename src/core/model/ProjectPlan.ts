
/**
 * Everything decided *before* scaffolding starts: the merged result of
 * config defaults, CLI flags, and interactive prompts. This is what
 * `--dry-run` prints and what a `--resume` fingerprint covers.
 *
 * Kept intentionally permissive (most fields optional, `[key: string]:
 * unknown` escape hatch) because the concrete field set still depends on
 * which project type or workflow is selected. Tightening this into a
 * discriminated union per project type is future work.
 */
export interface ProjectPlan {
  setupType?: "new" | "existing-wp";
  projectName?: string;
  projectType?: string;
  appType?: "application" | "wordpress";
  // `null` (distinct from `undefined`/absent) marks a field the user
  // explicitly cleared by switching project type away from it — see
  // applyProjectTypeChange in projectPrompts.ts, the one place that writes it.
  framework?: "react" | "nextjs" | null;
  useLaravel?: boolean;
  wpType?: "wp-theme" | "wp-woo" | "wp-react" | null;
  /** Local environment. "none" (application projects only) runs the project natively. */
  environment?: "docker" | "lando" | "none";
  customizeAdvanced?: boolean;

  mysqlVersion?: string;
  wpVersion?: string;
  themeRepo?: string;
  themeBranch?: string;
  sshKeyPath?: string;
  plugins?: string[];
  installWpCli?: boolean;

  skipGitInit?: boolean;
  /** Final observed Git state for the success summary; never persisted as configuration. */
  gitStatus?: string;

  packageManager?: string;
  nonInteractive?: boolean;

  [key: string]: unknown;
}

