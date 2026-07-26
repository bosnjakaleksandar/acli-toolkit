import type { Profile } from "./Profile.ts";

export interface ProjectLink {
  name: string;
  type?: string;
  environment: string;
  profile?: string | Profile;
  linkedAt?: string;
}

/** The shape of a parsed `.acli/config.yaml` or the platform user config file. Presets are intentionally untyped (`Record<string, unknown>`) — they're a free-form bag of ProjectPlan-shaped fields written back by `preset save`, and validating that shape lives with ProjectPlan/PlanBuilder, not the config document itself. */
export interface AcliConfig {
  version: number;
  defaults?: Record<string, unknown>;
  presets?: Record<string, Record<string, unknown>>;
  profiles?: Record<string, Profile>;
  project?: ProjectLink;
}
