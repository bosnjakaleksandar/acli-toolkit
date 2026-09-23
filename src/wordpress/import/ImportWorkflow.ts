import path from "node:path";
import fs from "fs-extra";
import DatabaseDumpService from "../migration/DatabaseDump.ts";
import WordPressMigrationService from "../migration/WordPressMigration.ts";
import { StepRunner } from "../../core/StepRunner.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import { mergeGitignoreForImport } from "../../system/gitignore.ts";
import { linkGitRemote } from "../../system/git.ts";
import { redactSecrets } from "../../config/redaction.ts";
import { writeLink } from "../../profiles/ProjectLink.ts";
import { providerFor, type RemoteBackend } from "../../providers/registry.ts";
import { linkDiscoveredGit } from "./linkGit.ts";
import type { ImportContext } from "./ImportContext.ts";

export interface ImportWorkflowOptions {
  /** The profile provider's backend for this project (see createRemoteBackend). */
  remote: RemoteBackend;
  ctx: ImportContext;
  targetDir: string;
  envService: EnvironmentService;
  spinner?: Spinner | null;
  resume?: boolean;
  resumeCommand?: string;
  /** Injectable for tests; defaults to the real pull-only Git linker. */
  gitLinker?: typeof linkGitRemote;
}

/**
 * Runs an import: preflight, fetch files, fetch a database dump, detect its
 * table prefix, scaffold the local environment, link the project to its
 * profile and Git origin, then (if a dump was fetched) import it and
 * search-replace URLs (DatabaseDumpService, WordPressMigrationService).
 * Everything server-specific happens in `remote`, the profile provider's
 * backend, so this runs unchanged for every provider.
 *
 * Prefix detection runs *before* scaffolding: the prefix gets templated
 * into docker-compose.yaml/.lando.yml, so detecting it after the
 * environment is already scaffolded would leave those files pointed at the
 * wrong tables (silently falling back to the "wp_" default). When
 * available, an authoritative remote-reported prefix (getRemoteFacts) wins
 * over guessing from the dump's own contents.
 *
 * Whether a dump exists is checked on disk (`<targetDir>/staging.sql`)
 * rather than tracked in an in-memory flag, so it stays correct across a
 * `--resume`: a flag set inside "fetch-database"'s run() would reset to its
 * initial value if that step is skipped because it already completed in a
 * prior run.
 *
 * Dependency install, Git init, and success/error rendering are the caller's
 * job (src/cli/commands/import.ts), mirroring how createProjectCommand handles
 * those same generic post-scaffold steps.
 */
export async function runImportWorkflow({ remote, ctx, targetDir, envService, spinner = null, resume, resumeCommand, gitLinker = linkGitRemote }: ImportWorkflowOptions): Promise<void> {
  const databaseDumpService = new DatabaseDumpService();
  const migrationService = new WordPressMigrationService(envService);
  const dumpPath = path.join(targetDir, "staging.sql");
  const hasDump = () => fs.pathExists(dumpPath);

  const steps = [
    {
      id: "preflight",
      title: "Validating requirements",
      run: async () => {
        await remote.preflight({ environment: ctx.environment, skipFiles: ctx.skipFiles });
      },
    },
    {
      id: "fetch-files",
      title: "Fetching WordPress files",
      run: async () => {
        if (ctx.skipFiles) return;
        spinner?.message?.("Fetching WordPress files...");
        await remote.syncFiles(targetDir, spinner);
      },
    },
    {
      id: "fetch-database",
      title: "Fetching database dump",
      run: async () => {
        if (ctx.skipDatabase) return;
        await remote.exportDatabase(targetDir, spinner);
      },
    },
    {
      id: "detect-prefix",
      title: "Detecting table prefix",
      run: async () => {
        if (!(await hasDump())) return null;
        spinner?.message?.("Detecting table prefix...");
        const remoteFacts = await remote.getRemoteFacts();
        const tablePrefix = await databaseDumpService.detectTablePrefix(targetDir, spinner, remoteFacts);
        ctx.tablePrefix = tablePrefix;
        return tablePrefix;
      },
      // Resumed past this step: the prefix was already detected and returned
      // last run, but ctx here is a fresh object this run never populated it.
      onSkip: (tablePrefix: unknown) => {
        if (typeof tablePrefix === "string") ctx.tablePrefix = tablePrefix;
      },
    },
    {
      id: "scaffold-environment",
      title: "Scaffolding local environment",
      run: async () => {
        spinner?.message?.("Scaffolding local WordPress environment...");
        await envService.scaffold(targetDir, "wordpress", ctx, spinner);
      },
    },
    {
      id: "link-profile",
      title: "Linking project to its profile",
      run: async () => {
        spinner?.message?.("Linking project to its staging profile...");
        // Everything that identifies this project on its server lives in the
        // link, so `acli pull` needs no arguments later.
        await writeLink(targetDir, {
          name: ctx.projectName,
          type: "wordpress",
          environment: ctx.environment,
          profile: ctx.profile.profileName,
          ...(ctx.remoteProject && ctx.remoteProject !== ctx.projectName ? { remoteProject: ctx.remoteProject } : {}),
          ...(ctx.selections && Object.keys(ctx.selections).length ? { selections: ctx.selections } : {}),
          linkedAt: new Date().toISOString(),
        });
        return ctx.profile.profileName ?? null;
      },
    },
    {
      id: "link-git",
      title: "Linking Git repository",
      run: async () => {
        if (ctx.skipGitLink || ctx.skipGitInit) return null;
        spinner?.message?.("Discovering remote Git repository...");
        return linkDiscoveredGit(remote, targetDir, ctx, { spinner, ...(resumeCommand ? { resumeCommand } : {}), gitLinker });
      },
      onSkip: (result: any) => {
        if (result?.summary) ctx.gitStatus = result.summary;
      },
    },
    {
      id: "gitignore",
      title: "Preparing WordPress Git ignore rules",
      run: async () => {
        spinner?.message?.("Preparing WordPress .gitignore rules...");
        await mergeGitignoreForImport(targetDir, "wordpress");
      },
    },
    {
      id: "import-database",
      title: "Importing database and replacing URLs",
      run: async () => {
        if (!(await hasDump())) {
          spinner?.message?.("No database dump supplied; skipping database import and search-replace.");
          return;
        }
        await migrationService.importAndReplace(targetDir, { ...ctx, resumeCommand }, spinner);
        // A dump of a real site contains user password hashes, so it is not
        // left lying in the new project directory once it has been imported
        // — the same cleanup PullService.importDatabase does for `acli
        // pull`. `--keep-dump` opts out (e.g. to re-run an import against
        // the same export without re-fetching it).
        if (!ctx.keepDump) await fs.remove(dumpPath).catch(() => {});
      },
    },
  ];

  const runner = new StepRunner(steps, targetDir, {
    resumeCommand,
    fingerprint: {
      command: "import",
      projectName: ctx.projectName,
      environment: ctx.environment,
      mysqlVersion: ctx.mysqlVersion,
      wpVersion: ctx.wpVersion,
      skipFiles: ctx.skipFiles,
      skipDatabase: ctx.skipDatabase,
      skipGitLink: ctx.skipGitLink,
      // Each provider decides which of its profile fields count, e.g.
      // Coolify menu selections don't invalidate a --resume.
      profile: providerFor(ctx.profile).fingerprint(redactSecrets(ctx.profile) as Record<string, unknown>),
    },
  });
  await runner.run({ resume: Boolean(resume) });
}

/** The `acli import --dry-run` plan: what would be fetched from where, and which local tools it needs. */
export function buildImportPlan(ctx: ImportContext, remote: RemoteBackend): Record<string, unknown> {
  return {
    profile: ctx.profile.profileName || null,
    project: ctx.projectName,
    localEnvironment: ctx.environment,
    remoteHost: ctx.profile.ssh.host,
    provider: ctx.profile.provider,
    ...providerFor(ctx.profile).plan(ctx.profile, { skipFiles: ctx.skipFiles, skipDatabase: Boolean(ctx.skipDatabase) }),
    gitLink: !ctx.skipGitInit && !ctx.skipGitLink && ctx.profile.git?.enabled !== false,
    // Shown because it decides which URLs get search-replaced: the imported
    // site's own siteurl always is, and this is the extra source folded in
    // alongside it (from --remote-url, or the profile's own urls.staging).
    stagingUrl: ctx.stagingUrl ?? ctx.profile.urls?.staging ?? null,
    requiredTools: remote.requiredTools({ environment: ctx.environment, skipFiles: ctx.skipFiles }),
  };
}
