/**
 * Mutable runtime state owned by a single create/import run. Distinct from
 * `ProjectPlan` (the frozen pre-execution decisions): this holds things that
 * only exist *because* execution happened — the resolved target directory,
 * warnings collected along the way, values a step discovered (like the
 * detected table prefix) that a later step needs. Never persisted to
 * history or presets, never fed back into prompts.
 */
export interface CreateContext {
  targetDir: string;
  ownsTargetDir: boolean;
  warnings: string[];
  completedSteps: string[];
  tablePrefix?: string;
  detectedSiteUrl?: string;
  dependenciesInstalled?: boolean;
  stagingRepoUrl?: string;
  skipGitInit?: boolean;
}

export function createEmptyContext(targetDir: string): CreateContext {
  return {
    targetDir,
    ownsTargetDir: false,
    warnings: [],
    completedSteps: [],
  };
}
