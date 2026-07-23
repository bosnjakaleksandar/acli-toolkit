import path from "node:path";
import fs from "fs-extra";
import { CliError } from "../core/errors.ts";
import { RemoteProfileService } from "./RemoteProfileService.js";
import WordPressMigrationService from "./WordPressMigrationService.js";

export const FILE_TARGETS = ["uploads", "plugins", "themes"];
export const ALL_TARGETS = ["db", ...FILE_TARGETS];

/**
 * Turns whatever a user typed for `acli pull [targets...]` into a concrete,
 * deduplicated target list. Kept pure and separate from execution so the
 * targets a given invocation resolves to can be asserted without running any
 * commands.
 *
 * @param {string[]} requested Raw target arguments (may be empty, may include "full").
 * @returns {string[]} Subset of ALL_TARGETS, in ALL_TARGETS order.
 */
export function resolvePullTargets(requested) {
  if (!requested || !requested.length || requested.includes("full")) return [...ALL_TARGETS];
  const invalid = requested.filter((target) => !ALL_TARGETS.includes(target));
  if (invalid.length) {
    throw new CliError(`Unknown pull target(s): ${invalid.join(", ")}.`, {
      code: "INVALID_PULL_TARGET",
      hint: `Valid targets: ${ALL_TARGETS.join(", ")}, or "full" for everything.`,
    });
  }
  return ALL_TARGETS.filter((target) => requested.includes(target));
}

/**
 * Orchestrates a selective sync from a linked profile into an already
 * scaffolded local project. This is the same machinery `acli create` uses
 * for its existing-wp sync — daily re-syncs and the sync that happens at
 * creation time are the same code path.
 *
 * IMPORTANT: every method here expects `profile` (or `ctx.profile`) to
 * already be the *resolved* profile (i.e. already passed through
 * `resolveRemoteProfile`). Resolving is not idempotent — `remote.wordpressRoot`
 * becomes an already-joined absolute path after the first resolution, so
 * resolving twice would join it onto itself. Callers resolve exactly once,
 * at their own entry point (ExistingWPStrategy.askQuestions for `create`,
 * the `pull` command for a standalone pull) and pass the resolved profile
 * through from there.
 */
export class PullService {
  constructor(envService, remoteProfileServiceFactory = (profile) => new RemoteProfileService(profile)) {
    this.envService = envService;
    this.remoteProfileServiceFactory = remoteProfileServiceFactory;
    this.migration = new WordPressMigrationService(envService);
  }

  async syncFiles(targetDir, profile, directories, spinner = null) {
    const remote = this.remoteProfileServiceFactory(profile);
    await remote.syncFiles(targetDir, spinner, directories ? { directories } : {});
  }

  async exportDatabase(targetDir, profile, spinner = null) {
    const remote = this.remoteProfileServiceFactory(profile);
    await remote.exportDatabase(targetDir, spinner);
  }

  /** Imports an already-exported staging.sql (see exportDatabase) and cleans it up unless keepDump is set. */
  async importDatabase(targetDir, ctx, spinner = null, { keepDump = false } = {}) {
    await this.migration.importAndReplace(targetDir, ctx, spinner);
    if (!keepDump) await fs.remove(path.join(targetDir, "staging.sql")).catch(() => {});
  }

  async pull(targetDir, ctx, targets, { keepDump = false } = {}, spinner = null) {
    const fileTargets = targets.filter((target) => FILE_TARGETS.includes(target));

    if (fileTargets.length) {
      spinner?.message(`Syncing ${fileTargets.join(", ")}...`);
      await this.syncFiles(targetDir, ctx.profile, fileTargets, spinner);
    }

    if (targets.includes("db")) {
      spinner?.message("Exporting remote database...");
      await this.exportDatabase(targetDir, ctx.profile, spinner);
      await this.importDatabase(targetDir, ctx, spinner, { keepDump });
    }
  }
}
