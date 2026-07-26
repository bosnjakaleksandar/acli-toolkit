import path from "node:path";
import fs from "fs-extra";
import { CliError } from "../../core/errors.ts";
import { RemoteHost } from "../../remote/RemoteHost.ts";
import WordPressMigrationService from "../migration/WordPressMigration.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import type { ResolvedProfile } from "../../core/model/Profile.ts";

export const FILE_TARGETS = ["uploads", "plugins", "themes"];
export const ALL_TARGETS = ["db", ...FILE_TARGETS];

type RemoteHostFactory = (profile: ResolvedProfile) => RemoteHost;

/**
 * Turns whatever a user typed for `acli pull [targets...]` into a concrete,
 * deduplicated target list. Kept pure and separate from execution so the
 * targets a given invocation resolves to can be asserted without running any
 * commands.
 *
 * @param requested Raw target arguments (may be empty, may include "full").
 * @returns Subset of ALL_TARGETS, in ALL_TARGETS order.
 */
export function resolvePullTargets(requested: string[]): string[] {
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
  envService: EnvironmentService;
  remoteHostFactory: RemoteHostFactory;
  migration: WordPressMigrationService;

  constructor(envService: EnvironmentService, remoteHostFactory: RemoteHostFactory = (profile) => new RemoteHost(profile)) {
    this.envService = envService;
    this.remoteHostFactory = remoteHostFactory;
    this.migration = new WordPressMigrationService(envService);
  }

  async syncFiles(targetDir: string, profile: ResolvedProfile, directories: string[] | undefined, spinner: Spinner | null = null): Promise<void> {
    const remote = this.remoteHostFactory(profile);
    await remote.syncFiles(targetDir, spinner, directories ? { directories } : {});
  }

  async exportDatabase(targetDir: string, profile: ResolvedProfile, spinner: Spinner | null = null): Promise<void> {
    const remote = this.remoteHostFactory(profile);
    await remote.exportDatabase(targetDir, spinner);
  }

  /** Imports an already-exported staging.sql (see exportDatabase) and cleans it up unless keepDump is set. */
  async importDatabase(targetDir: string, ctx: any, spinner: Spinner | null = null, { keepDump = false }: { keepDump?: boolean } = {}): Promise<void> {
    await this.migration.importAndReplace(targetDir, ctx, spinner);
    if (!keepDump) await fs.remove(path.join(targetDir, "staging.sql")).catch(() => {});
  }

  async pull(targetDir: string, ctx: any, targets: string[], { keepDump = false }: { keepDump?: boolean } = {}, spinner: Spinner | null = null): Promise<void> {
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
