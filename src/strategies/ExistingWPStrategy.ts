import BaseStrategy from "./BaseStrategy.ts";
import { scaffoldGitignore } from "../utils/git.js";
import { askMysqlVersion, askWpVersion } from "../utils/prompts.js";
import { hasPresetValue } from "../services/PresetService.ts";
import DatabaseDumpService from "../services/DatabaseDumpService.ts";
import { PullService } from "../services/PullService.ts";
import { RemoteProfileService, resolveRemoteProfile } from "../services/RemoteProfileService.ts";
import { writeLink } from "../services/ProjectLinkService.ts";
import { runCommand } from "../utils/commandRunner.ts";
import type EnvironmentService from "../services/EnvironmentService.ts";
import type { Spinner } from "../services/EnvironmentService.ts";
import type { ResolvedProfile } from "../core/model/ResolvedProfile.ts";

type RemoteProfileServiceFactory = (profile: ResolvedProfile) => RemoteProfileService;

export default class ExistingWPStrategy extends BaseStrategy {
  databaseDumpService: DatabaseDumpService;
  remoteProfileServiceFactory: RemoteProfileServiceFactory;
  pullService: PullService;

  constructor(envService: EnvironmentService | null, remoteProfileServiceFactory: RemoteProfileServiceFactory = (profile) => new RemoteProfileService(profile)) {
    super(envService);
    this.databaseDumpService = new DatabaseDumpService();
    this.remoteProfileServiceFactory = remoteProfileServiceFactory;
    this.pullService = new PullService(envService!, remoteProfileServiceFactory);
  }

  override async askQuestions(ctx: any, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<any> {
    // "Customize advanced settings?" (asked earlier, for every project type)
    // used to be a dead end here: this strategy always asked the MySQL/WP
    // version questions regardless of the answer, so declining had no
    // effect and the default journey was never actually shorter. Skipping
    // straight to the defaults when the user didn't opt in makes that
    // prompt meaningful for existing-WP imports too.
    const skipAdvancedPrompts = nonInteractive || !ctx.customizeAdvanced;
    const mysqlVersion = hasPresetValue(ctx, "mysqlVersion") ? ctx.mysqlVersion : skipAdvancedPrompts ? "8.0" : await askMysqlVersion();
    const wpVersion = ctx.environment === "docker"
      ? hasPresetValue(ctx, "wpVersion") ? ctx.wpVersion : skipAdvancedPrompts ? "latest" : await askWpVersion()
      : "latest";
    const profile = resolveRemoteProfile(ctx.profile, ctx);
    // A staging URL is a helpful extra search-replace source but is no
    // longer required: importAndReplace reads the real siteurl back out of
    // the imported database, which works regardless of whether the profile
    // documents urls.staging or follows any particular naming convention.
    const stagingUrl = ctx.stagingUrl || profile.urls?.staging || null;
    return { ...ctx, mysqlVersion, wpVersion, stagingUrl, profile };
  }

  buildPlan(ctx: any): unknown {
    const remote = this.remoteProfileServiceFactory(ctx.profile);
    return {
      preset: ctx.presetName || null, profile: ctx.profile.profileName || null, project: ctx.projectName,
      localEnvironment: ctx.environment, remoteHost: ctx.profile.ssh.host, remoteWordPressRoot: ctx.profile.remote.wordpressRoot,
      databaseDriver: ctx.skipDatabase ? "skipped" : ctx.profile.database.driver,
      fileTransfer: ctx.skipFiles ? "skipped" : ctx.profile.files?.transport || "rsync",
      gitLink: !ctx.skipGitLink && ctx.profile.git?.enabled !== false,
      requiredTools: remote.requiredTools(ctx), localUrl: this.envService!.getLocalUrl(ctx),
    };
  }

  async preflight(ctx: any, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Preflight: validating local and remote capabilities...");
    await this.remoteProfileServiceFactory(ctx.profile).preflight(ctx);
  }

  override async scaffold(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    const remote = this.remoteProfileServiceFactory(ctx.profile);
    let step = 1;
    const total = 7;
    await scaffoldGitignore(targetDir, "wp-existing");

    // Files and the initial database export/prefix-detection go through
    // PullService's granular methods (not its bundled pull()) because
    // create, unlike a later `acli pull`, needs the export to finish and the
    // table prefix detected *before* the environment is scaffolded (the
    // prefix gets templated into docker-compose.yaml/.lando.yml). The import
    // step below reuses that same already-exported dump — no second export.
    if (!ctx.skipFiles) {
      spinner?.message(`${step++}/${total} Transferring WordPress files...`);
      await this.#step("transfer files", () => this.pullService.syncFiles(targetDir, ctx.profile, undefined, spinner));
    }
    if (!ctx.skipDatabase) {
      spinner?.message(`${step++}/${total} Exporting remote database...`);
      await this.#step("export database", () => this.pullService.exportDatabase(targetDir, ctx.profile, spinner));
      const remoteFacts = await remote.getRemoteFacts();
      ctx.tablePrefix = await this.#step("detect table prefix", () => this.databaseDumpService.detectTablePrefix(targetDir, spinner, remoteFacts));
    }

    spinner?.message(`${step++}/${total} Starting local environment...`);
    await this.#step("start local environment", () => this.scaffoldEnvironment(targetDir, ctx, spinner));

    spinner?.message(`${step++}/${total} Linking project to its staging profile...`);
    await this.#step("link project to profile", () => writeLink(targetDir, { name: ctx.projectName, type: "wordpress", environment: ctx.environment, profile: ctx.profile.profileName, linkedAt: new Date().toISOString() }));

    if (!ctx.skipGitLink) {
      spinner?.message(`${step++}/${total} Linking Git repository...`);
      await this.#step("link git repository", () => this.#linkGit(targetDir, ctx, remote, spinner));
    }
    if (!ctx.skipDatabase) {
      spinner?.message(`${step++}/${total} Importing database and replacing URLs...`);
      await this.#step("import database", () => this.pullService.importDatabase(targetDir, ctx, spinner, { keepDump: ctx.keepDump }));
    }
    spinner?.message(`${Math.min(step, total)}/${total} Finalizing migration...`);
  }

  // Prefixes a failed step's error with which phase it came from — the
  // scaffold sequence has seven meaningfully different phases (rsync,
  // remote dump, prefix detection, environment startup, linking, git,
  // import), and "Command failed: ..." alone doesn't tell you which one
  // broke. error.code/hint are preserved so downstream resume-command and
  // suggestion logic (WordPressMigrationService, formatCreateError) is
  // unaffected.
  async #step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (error && !error.step) {
        error.step = label;
        error.message = `Step "${label}" failed: ${error.message}`;
      }
      throw error;
    }
  }

  async #linkGit(targetDir: string, ctx: any, remote: RemoteProfileService, spinner: Spinner | null): Promise<void> {
    spinner?.message("Discovering remote Git repository...");
    const found = await remote.discoverGit();
    if (!found) return;
    ctx.stagingRepoUrl = found.url;
    ctx.skipGitInit = true;
    await runCommand("git", ["init"], { cwd: targetDir });
    await runCommand("git", ["remote", "add", "origin", found.url], { cwd: targetDir });
  }

  override getTemplateType(): string { return "wordpress"; }
}
