import path from "node:path";
import fs from "fs-extra";
import DatabaseDumpService from "../migration/DatabaseDump.ts";
import WordPressMigrationService from "../migration/WordPressMigration.ts";
import { StepRunner } from "../../core/StepRunner.ts";
import type { ImportSource, ImportSourceContext } from "./ImportSource.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";
import { mergeGitignoreForImport } from "../../system/gitignore.ts";

export interface ImportWorkflowOptions {
  source: ImportSource;
  ctx: ImportSourceContext & { environment?: string; skipFiles?: boolean; skipDatabase?: boolean; skipGitLink?: boolean; keepDump?: boolean };
  targetDir: string;
  envService: EnvironmentService;
  spinner?: Spinner | null;
  resume?: boolean;
  resumeCommand?: string;
}

/**
 * Runs the source-agnostic half of an import: preflight, fetch files, fetch
 * a database dump, detect its table prefix, scaffold the local environment,
 * link the project to its source (profile/git, when the source supports
 * it), then (if a dump was fetched) run the same import/search-replace
 * pipeline every import source shares (DatabaseDumpService,
 * WordPressMigrationService).
 *
 * The `preflight`/`getRemoteFacts`/`linkProfile`/`linkGit` steps are no-ops
 * for sources that don't implement the matching optional ImportSource
 * method (local/git/zip/sql today) — this is the one executor for every
 * source, remote or local; a source opts into the steps it needs rather
 * than the workflow branching on which source it's running.
 *
 * Prefix detection runs *before* scaffolding, matching what a source-level
 * import always required: the prefix gets templated into
 * docker-compose.yaml/.lando.yml, so detecting it after the environment is
 * already scaffolded would leave those files pointed at the wrong tables
 * (silently falling back to the "wp_" default). When available, an
 * authoritative remote-reported prefix (getRemoteFacts) wins over guessing
 * from the dump's own contents.
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
export async function runImportWorkflow({ source, ctx, targetDir, envService, spinner, resume, resumeCommand }: ImportWorkflowOptions): Promise<void> {
  const databaseDumpService = new DatabaseDumpService();
  const migrationService = new WordPressMigrationService(envService);
  const dumpPath = path.join(targetDir, "staging.sql");
  const hasDump = () => fs.pathExists(dumpPath);

  const steps = [
    {
      id: "preflight",
      title: "Validating requirements",
      run: async () => {
        await source.preflight?.(ctx);
      },
    },
    {
      id: "fetch-files",
      title: "Fetching WordPress files",
      run: async () => {
        if (ctx.skipFiles) return;
        spinner?.message?.(`Fetching files via ${source.label}...`);
        await source.fetchFiles(ctx, spinner);
      },
    },
    {
      id: "fetch-database",
      title: "Fetching database dump",
      run: async () => {
        if (ctx.skipDatabase) return;
        await source.fetchDatabase(ctx, spinner);
      },
    },
    {
      id: "detect-prefix",
      title: "Detecting table prefix",
      run: async () => {
        if (!(await hasDump())) return null;
        spinner?.message?.("Detecting table prefix...");
        const remoteFacts = source.getRemoteFacts ? await source.getRemoteFacts(ctx) : null;
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
      title: "Linking project to its source",
      run: async () => {
        if (!source.linkProfile) return null;
        spinner?.message?.("Linking project to its staging profile...");
        return source.linkProfile(targetDir, ctx);
      },
    },
    {
      id: "link-git",
      title: "Linking Git repository",
      run: async () => {
        if (!source.linkGit || ctx.skipGitLink || ctx.skipGitInit) return null;
        spinner?.message?.("Discovering remote Git repository...");
        return source.linkGit(targetDir, ctx, spinner);
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

  const runner = new StepRunner(steps, targetDir, { resumeCommand });
  await runner.run({ resume: Boolean(resume) });
}
