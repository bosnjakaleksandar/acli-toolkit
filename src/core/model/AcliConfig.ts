import type { CoolifySelection, Profile } from "./Profile.ts";

/**
 * `.acli/config.yaml`'s `project:` block: which profile (server) this local
 * project syncs from, and anything that identifies the project *on* that
 * server. A profile describes a server and serves many projects, so
 * per-project details live here rather than in the profile.
 */
export interface ProjectLink {
  name: string;
  type?: string;
  environment: string;
  profile?: string;
  /** The project's name on the server when it differs from `name` (e.g. "Acme Client Site"). */
  remoteProject?: string;
  /** Answers remembered for the server's "which container/database?" prompts. */
  selections?: CoolifySelection;
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
