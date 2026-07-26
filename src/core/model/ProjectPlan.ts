import type { ResolvedProfile } from "./ResolvedProfile.ts";

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
  // `null` (distinct from `undefined`/absent) marks a field the user
  // explicitly cleared by switching project type away from it — see
  // applyProjectTypeChange in projectPrompts.ts, the one place that writes it.
  framework?: "react" | "nextjs" | null;
  useLaravel?: boolean;
  wpType?: "wp-theme" | "wp-woo" | "wp-react" | null;
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

/**
 * Stricter, `setupType`-narrowed views of ProjectPlan, for the two call
 * sites that already know which branch they're in and want that expressed
 * in the type rather than read back out with an unchecked field access:
 * `NewProjectPlan` (a fresh scaffold — never has a profile) and
 * `ExistingWpPlan` (an existing-WP import — always does, and by the time a
 * caller has one, `profile` is already the *resolved* connection-ready
 * object, not the raw config reference ProjectPlan.profile describes).
 *
 * Not yet what most of the codebase types `ctx` as — that's still the
 * permissive `ProjectPlan` above, and deliberately so: most collaborators
 * (strategies, CliOptionsService, PresetService, HistoryService, ...) build
 * or read a plan before `setupType` has necessarily settled either way, and
 * converting every one of those call sites to narrow first is real,
 * separate work (see the class entry above) rather than a mechanical
 * rename. Adopt these two where a function already only makes sense for one
 * branch — new code and future narrowing passes should prefer them there
 * instead of reaching for `ProjectPlan` plus a manual cast.
 */
export interface NewProjectPlan extends Omit<ProjectPlan, "setupType" | "profile"> {
  setupType?: "new";
}

export interface ExistingWpPlan extends Omit<ProjectPlan, "setupType" | "profile"> {
  setupType: "existing-wp";
  profile: ResolvedProfile;
}
