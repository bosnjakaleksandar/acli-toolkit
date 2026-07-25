import BaseStrategy from "./BaseStrategy.ts";
import { scaffoldGitignore } from "../utils/git.ts";
import { askMysqlVersion, askWpVersion } from "../utils/prompts.ts";
import { hasPresetValue } from "../services/PresetService.ts";
import DatabaseDumpService from "../services/DatabaseDumpService.ts";
import { PullService } from "../services/PullService.ts";
import { RemoteProfileService, resolveRemoteProfile } from "../services/RemoteProfileService.ts";
import { writeLink } from "../services/ProjectLinkService.ts";
import { runCommand } from "../utils/commandRunner.ts";
import { isSafeGitUrl, redactUrlCredentials } from "../utils/safety.ts";
import type EnvironmentService from "../services/EnvironmentService.ts";
import type { Spinner } from "../services/EnvironmentService.ts";
import type { ResolvedProfile, Profile } from "../core/model/ResolvedProfile.ts";
import type { ProjectPlan } from "../core/model/ProjectPlan.ts";

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

  override async askQuestions(ctx: ProjectPlan, { nonInteractive = false }: { nonInteractive?: boolean } = {}): Promise<ProjectPlan> {
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
    const profile = resolveRemoteProfile(ctx.profile as unknown as Profile, ctx as { projectName: string });
    // A staging URL is a helpful extra search-replace source but is no
    // longer required: importAndReplace reads the real siteurl back out of
    // the imported database, which works regardless of whether the profile
    // documents urls.staging or follows any particular naming convention.
    const stagingUrl = ctx.stagingUrl || profile.urls?.staging || null;
    // ProjectPlan.profile is documented as "never the resolved connection
    // details" (see ResolvedProfileRef) — but this strategy's whole downstream
    // (buildPlan/preflight/scaffold/#linkGit) depends on ctx.profile actually
    // holding one from here on. That tension is real and pre-existing;
    // resolving it properly needs a discriminated ProjectPlan union (planned,
    // not yet done) rather than a strategy-local workaround. This cast is the
    // single place that widening happens, so it can be found and removed then.
    return { ...ctx, mysqlVersion, wpVersion, stagingUrl, profile } as ProjectPlan;
  }

  buildPlan(ctx: ProjectPlan): unknown {
    const profile = resolvedProfile(ctx);
    const remote = this.remoteProfileServiceFactory(profile);
    return {
      preset: ctx.presetName || null, profile: profile.profileName || null, project: ctx.projectName,
      localEnvironment: ctx.environment, remoteHost: profile.ssh.host, remoteWordPressRoot: profile.remote.wordpressRoot,
      databaseDriver: ctx.skipDatabase ? "skipped" : profile.database.driver,
      fileTransfer: ctx.skipFiles ? "skipped" : profile.files?.transport || "rsync",
      gitLink: !ctx.skipGitLink && profile.git?.enabled !== false,
      requiredTools: remote.requiredTools(ctx as { environment?: string; skipFiles?: boolean }), localUrl: this.envService!.getLocalUrl(ctx),
    };
  }

  async preflight(ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    spinner?.message("Preflight: validating local and remote capabilities...");
    const profile = resolvedProfile(ctx);
    await this.remoteProfileServiceFactory(profile).preflight(ctx as { environment?: string; skipFiles?: boolean });
  }

  override async scaffold(targetDir: string, ctx: ProjectPlan, spinner: Spinner | null = null): Promise<void> {
    const profile = resolvedProfile(ctx);
    const remote = this.remoteProfileServiceFactory(profile);
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
      await this.#step("transfer files", () => this.pullService.syncFiles(targetDir, profile, undefined, spinner));
    }
    if (!ctx.skipDatabase) {
      spinner?.message(`${step++}/${total} Exporting remote database...`);
      await this.#step("export database", () => this.pullService.exportDatabase(targetDir, profile, spinner));
      const remoteFacts = await remote.getRemoteFacts();
      ctx.tablePrefix = await this.#step("detect table prefix", () => this.databaseDumpService.detectTablePrefix(targetDir, spinner, remoteFacts));
    }

    spinner?.message(`${step++}/${total} Starting local environment...`);
    await this.#step("start local environment", () => this.scaffoldEnvironment(targetDir, ctx, spinner));

    spinner?.message(`${step++}/${total} Linking project to its staging profile...`);
    await this.#step("link project to profile", () => writeLink(targetDir, { name: ctx.projectName!, type: "wordpress", environment: ctx.environment!, profile: profile.profileName, linkedAt: new Date().toISOString() }));

    if (!ctx.skipGitLink) {
      spinner?.message(`${step++}/${total} Linking Git repository...`);
      await this.#step("link git repository", () => this.#linkGit(targetDir, ctx, remote, spinner));
    }
    if (!ctx.skipDatabase) {
      spinner?.message(`${step++}/${total} Importing database and replacing URLs...`);
      await this.#step("import database", () => this.pullService.importDatabase(targetDir, ctx, spinner, { keepDump: ctx.keepDump as boolean | undefined }));
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

  async #linkGit(targetDir: string, ctx: ProjectPlan, remote: RemoteProfileService, spinner: Spinner | null): Promise<void> {
    spinner?.message("Discovering remote Git repository...");
    const found = await remote.discoverGit();
    if (!found) return;
    // found.url is the remote server's own `git config --get
    // remote.origin.url` output — untrusted server-controlled data. Skip
    // linking rather than write something unsafe into the new project's git
    // config or hand it to `git remote add` as a positional argument.
    if (!isSafeGitUrl(found.url)) {
      spinner?.message(`Skipping Git link: remote origin URL looked unsafe (${redactUrlCredentials(found.url)}).`);
      return;
    }
    ctx.stagingRepoUrl = found.url;
    ctx.skipGitInit = true;
    await runCommand("git", ["init"], { cwd: targetDir });
    await runCommand("git", ["remote", "add", "origin", found.url], { cwd: targetDir });
  }

  override getTemplateType(): string { return "wordpress"; }
}

// ProjectPlan.profile is typed as the raw, unresolved reference (string |
// ResolvedProfileRef) — see the comment in askQuestions() above for why
// ctx.profile is actually a ResolvedProfile by the time every method below
// this point runs. Centralizes that one cast so each call site doesn't
// repeat it.
function resolvedProfile(ctx: ProjectPlan): ResolvedProfile {
  return ctx.profile as unknown as ResolvedProfile;
}
