import path from "node:path";
import fs from "fs-extra";
import { CliError } from "../../core/errors.ts";
import { createRemoteBackend, type RemoteBackendFactory, type RemoteBackendOptions } from "../../providers/registry.ts";
import WordPressMigrationService from "../migration/WordPressMigration.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ResolvedProfile } from "../../core/model/Profile.ts";

/**
 * Turns whatever a user typed for `acli pull [targets...]` into a concrete,
 * deduplicated target list for this profile. Kept pure and separate from
 * execution so the targets a given invocation resolves to can be asserted
 * without running any commands.
 *
 * @param requested Raw target arguments (may be empty, may include "full").
 * @param available Everything the profile can pull: "db" plus its file targets.
 * @returns Subset of `available`, in `available` order.
 */
export function resolvePullTargets(requested: string[], available: string[]): string[] {
  if (!requested || !requested.length || requested.includes("full")) return [...available];
  const invalid = requested.filter((target) => !available.includes(target));
  if (invalid.length) {
    throw new CliError(`Unknown pull target(s): ${invalid.join(", ")}.`, {
      code: "INVALID_PULL_TARGET",
      hint: `Targets for this profile: ${available.join(", ")}, or "full" for everything.`,
    });
  }
  return available.filter((target) => requested.includes(target));
}

/** What one `acli pull` run knows about the linked project. */
export interface PullContext {
  projectName: string;
  environment: string;
  /** Already resolved (see resolveRemoteProfile) — never resolved again here. */
  profile: ResolvedProfile;
  keepDump?: boolean;
  nonInteractive?: boolean;
  resumeCommand?: string;
  /** Told about each server prompt answer, so the project link can remember it. */
  onSelection?: RemoteBackendOptions["onSelection"];
}

/**
 * Orchestrates a selective sync from a linked profile into an already
 * scaffolded local project. Shares RemoteBackend with the import pipeline, so
 * a daily re-sync and the initial import pull files and databases the same
 * way.
 *
 * IMPORTANT: every method here expects `profile` (or `ctx.profile`) to
 * already be the *resolved* profile (i.e. already passed through
 * `resolveRemoteProfile`). Resolving is not idempotent — `remote.wordpressRoot`
 * becomes an already-joined absolute path after the first resolution, so
 * resolving twice would join it onto itself. The `pull` command resolves it
 * exactly once and passes the resolved profile through.
 */
export class PullService {
  envService: EnvironmentService;
  remoteHostFactory: RemoteBackendFactory;
  migration: WordPressMigrationService;

  constructor(envService: EnvironmentService, remoteHostFactory: RemoteBackendFactory = createRemoteBackend) {
    this.envService = envService;
    this.remoteHostFactory = remoteHostFactory;
    this.migration = new WordPressMigrationService(envService);
  }

  /** Everything this profile can pull: the database plus the provider's file targets. */
  availableTargets(profile: ResolvedProfile): string[] {
    return ["db", ...this.remoteHostFactory(profile).fileTargets()];
  }

  /** Imports an already-exported staging.sql (see exportDatabase) and cleans it up unless keepDump is set. */
  async importDatabase(targetDir: string, ctx: PullContext, spinner: Spinner | null = null, { keepDump = false }: { keepDump?: boolean } = {}): Promise<void> {
    await this.migration.importAndReplace(targetDir, ctx, spinner);
    if (!keepDump) await fs.remove(path.join(targetDir, "staging.sql")).catch(() => {});
  }

  async pull(targetDir: string, ctx: PullContext, targets: string[], { keepDump = false }: { keepDump?: boolean } = {}, spinner: Spinner | null = null): Promise<void> {
    // One backend for the whole pull, so an answer picked interactively
    // (e.g. which database container) is reused by later steps.
    const remote = this.remoteHostFactory(ctx.profile, { interactive: !ctx.nonInteractive, ...(ctx.onSelection ? { onSelection: ctx.onSelection } : {}) });
    const fileTargets = targets.filter((target) => target !== "db");

    if (fileTargets.length) {
      spinner?.message(`Syncing ${fileTargets.join(", ")}...`);
      await remote.syncFiles(targetDir, spinner, { directories: fileTargets });
    }

    if (targets.includes("db")) {
      spinner?.message("Exporting remote database...");
      await remote.exportDatabase(targetDir, spinner);
      await this.importDatabase(targetDir, ctx, spinner, { keepDump });
    }
  }
}
