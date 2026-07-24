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
}

/**
 * Runs the source-agnostic half of an import: fetch files, fetch a database
 * dump, scaffold the local environment, then (if a dump was fetched) run the
 * same table-prefix detection and import/search-replace pipeline the
 * profile-based `create --existing` flow uses (DatabaseDumpService,
 * WordPressMigrationService) — unmodified, so the two paths stay consistent.
 * Dependency install, Git init, and success/error rendering are the caller's
 * job (src/commands/import.ts), mirroring how createProjectCommand handles
 * those same generic post-scaffold steps.
 */
export async function runImportWorkflow({ source, ctx, targetDir, envService, spinner, resume }: ImportWorkflowOptions): Promise<void> {
  const databaseDumpService = new DatabaseDumpService();
  const migrationService = new WordPressMigrationService(envService);
  let hasDump = false;

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
        const result = await source.fetchDatabase(ctx, spinner);
        hasDump = result.hasDump;
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
        if (!hasDump) {
          spinner?.message?.("No database dump supplied; skipping database import and search-replace.");
          return;
        }
        spinner?.message?.("Detecting table prefix...");
        ctx.tablePrefix = await databaseDumpService.detectTablePrefix(targetDir, spinner);
        await migrationService.importAndReplace(targetDir, ctx, spinner);
      },
    },
  ];

  const runner = new StepRunner(steps, targetDir);
  await runner.run({ resume: Boolean(resume) });
}
