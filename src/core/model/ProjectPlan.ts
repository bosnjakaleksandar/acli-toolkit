/**
 * Everything decided *before* scaffolding starts: the merged result of
 * config defaults, history, a preset, --set overrides, CLI flags, and
 * interactive prompts. This is what `--dry-run` prints, what HistoryService
 * persists, and what `preset save` serializes — today those three call
 * sites each reserialize the same ad-hoc `ctx` object independently; this
 * type documents the single shape they should agree on.
 *
 * Kept intentionally permissive (most fields optional, `[key: string]:
 * unknown` escape hatch) because the concrete field set still depends on
 * which ProjectType/ImportSource is selected, and several collaborators
 * (strategies, CliOptionsService, PresetService) remain untyped JS until
 * later phases convert them. Tightening this into a discriminated union
 * per project type is expected once those conversions land.
 */
export interface ProjectPlan {
  setupType?: "new" | "existing-wp";
  projectName?: string;
  projectType?: string;
  appType?: "application" | "wordpress";
  framework?: "react" | "nextjs";
  useLaravel?: boolean;
  wpType?: "wp-theme" | "wp-woo" | "wp-react";
  environment?: "docker" | "lando";
  customizeAdvanced?: boolean;

  mysqlVersion?: string;
  wpVersion?: string;
  themeRepo?: string;
  themeBranch?: string;
  sshKeyPath?: string;
  plugins?: string[];
  installWpCli?: boolean;

  stagingUrl?: string;
  profile?: string | ResolvedProfileRef;
  presetName?: string;

  skipGitInit?: boolean;
  skipFiles?: boolean;
  skipDatabase?: boolean;
  skipGitLink?: boolean;
  keepDump?: boolean;

  packageManager?: string;
  nonInteractive?: boolean;

  [key: string]: unknown;
}

/** The minimal shape History/Preset persistence keeps for an attached profile — never the resolved connection details. */
export interface ResolvedProfileRef {
  profileName: string;
}
