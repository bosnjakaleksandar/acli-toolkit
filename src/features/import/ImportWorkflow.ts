import path from "node:path";
import fs from "fs-extra";
import DatabaseDumpService from "../../services/DatabaseDumpService.ts";
import WordPressMigrationService from "../../services/WordPressMigrationService.ts";
import { StepRunner } from "../../core/StepRunner.ts";
import type { ImportSource, ImportSourceContext } from "./ImportSource.ts";

export interface ImportWorkflowOptions {
  source: ImportSource;
  ctx: ImportSourceContext & { environment?: string; skipFiles?: boolean; skipDatabase?: boolean };
  targetDir: string;
  envService: any;
  spinner?: any;
  resume?: boolean;
  resumeCommand?: string;
}

/**
 * Runs the source-agnostic half of an import: fetch files, fetch a database
 * dump, detect its table prefix, scaffold the local environment, then (if a
 * dump was fetched) run the same import/search-replace pipeline the
 * profile-based `create --existing` flow uses (DatabaseDumpService,
 * WordPressMigrationService) — unmodified, so the two paths stay consistent.
 *
 * Prefix detection runs *before* scaffolding, matching
 * ExistingWPStrategy.scaffold: the prefix gets templated into
 * docker-compose.yaml/.lando.yml, so detecting it after the environment is
 * already scaffolded would leave those files pointed at the wrong tables
 * (silently falling back to the "wp_" default).
 *
 * Whether a dump exists is checked on disk (`<targetDir>/staging.sql`)
 * rather than tracked in an in-memory flag, so it stays correct across a
 * `--resume`: a flag set inside "fetch-database"'s run() would reset to its
 * initial value if that step is skipped because it already completed in a
 * prior run.
 *
 * Dependency install, Git init, and success/error rendering are the caller's
 * job (src/commands/import.ts), mirroring how createProjectCommand handles
 * those same generic post-scaffold steps.
 */
export async function runImportWorkflow({ source, ctx, targetDir, envService, spinner, resume, resumeCommand }: ImportWorkflowOptions): Promise<void> {
  const databaseDumpService = new DatabaseDumpService();
  const migrationService = new WordPressMigrationService(envService);
  const dumpPath = path.join(targetDir, "staging.sql");
  const hasDump = () => fs.pathExists(dumpPath);

  const steps = [
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
        const tablePrefix = await databaseDumpService.detectTablePrefix(targetDir, spinner);
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
      id: "import-database",
      title: "Importing database and replacing URLs",
      run: async () => {
        if (!(await hasDump())) {
          spinner?.message?.("No database dump supplied; skipping database import and search-replace.");
          return;
        }
        await migrationService.importAndReplace(targetDir, ctx, spinner);
      },
    },
  ];

  const runner = new StepRunner(steps, targetDir, { resumeCommand });
  await runner.run({ resume: Boolean(resume) });
}
