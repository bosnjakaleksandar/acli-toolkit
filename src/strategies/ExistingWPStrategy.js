import BaseStrategy from "./BaseStrategy.js";
import { text } from "@clack/prompts";
import { scaffoldGitignore } from "../utils/git.js";
import {
  ask,
  askMysqlVersion,
  askSshKeyPath,
  askWpVersion,
} from "../utils/prompts.js";
import { hasPresetValue } from "../services/PresetService.js";
import DatabaseDumpService from "../services/DatabaseDumpService.js";
import GitRepositoryService from "../services/GitRepositoryService.js";
import StagingSyncService from "../services/StagingSyncService.js";
import WordPressMigrationService from "../services/WordPressMigrationService.js";

export default class ExistingWPStrategy extends BaseStrategy {
  constructor(envService) {
    super(envService);
    this.stagingSyncService = new StagingSyncService();
    this.databaseDumpService = new DatabaseDumpService();
    this.gitRepositoryService = new GitRepositoryService();
    this.wordpressMigrationService = new WordPressMigrationService(envService);
  }

  async askQuestions(ctx, { nonInteractive = false } = {}) {
    const mysqlVersion = hasPresetValue(ctx, "mysqlVersion")
      ? ctx.mysqlVersion
      : nonInteractive
        ? "8.0"
        : await askMysqlVersion();
    const wpVersion = hasPresetValue(ctx, "wpVersion")
      ? ctx.wpVersion
      : nonInteractive
        ? "latest"
        : await askWpVersion();
    const sshKeyPath = hasPresetValue(ctx, "sshKeyPath")
      ? ctx.sshKeyPath
      : nonInteractive
        ? ""
        : await askSshKeyPath();

    const suffix = process.env.STAGING_SUFFIX || ".staging";
    const stagingUrl = hasPresetValue(ctx, "stagingUrl")
      ? ctx.stagingUrl
      : nonInteractive
        ? `https://${ctx.projectName}${suffix}`
        : await ask(text, {
            message: "What is the Staging URL for search-replace?",
            initialValue: `https://${ctx.projectName}${suffix}`,
          });

    return { ...ctx, mysqlVersion, wpVersion, stagingUrl, sshKeyPath };
  }

  async scaffold(targetDir, ctx, spinner = null) {
    const ssh = this.#resolveSshOptions(ctx);

    await scaffoldGitignore(targetDir, "wp-existing");
    await this.stagingSyncService.pullRemoteFiles(targetDir, ssh, spinner);
    await this.databaseDumpService.exportDatabase(targetDir, ctx, ssh, spinner);

    ctx.tablePrefix = await this.databaseDumpService.detectTablePrefix(targetDir, spinner);

    await this.scaffoldEnvironment(targetDir, ctx, spinner);
    await this.gitRepositoryService.linkRepository(targetDir, ctx, ssh, spinner);
    await this.wordpressMigrationService.importAndReplace(targetDir, ctx, spinner);
  }

  getTemplateType() {
    return "wordpress";
  }

  #resolveSshOptions(ctx) {
    const host = process.env.STAGING_SSH_HOST;
    if (!host) {
      throw new Error(
        "STAGING_SSH_HOST is not set in .env. Cannot connect to staging server.",
      );
    }

    const sshUserHost = `${ctx.projectName}@${host}`;
    const remoteDir = `${ctx.projectName}/wordpress`;
    const resolvedKeyPath = ctx.sshKeyPath
      ? ctx.sshKeyPath.replace(/^~/, process.env.HOME)
      : "";
    const sshOpt = resolvedKeyPath
      ? `-i ${resolvedKeyPath} -o IdentitiesOnly=yes -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`
      : "";
    const rsyncSshOpt = resolvedKeyPath
      ? `-e "ssh -i ${resolvedKeyPath} -o IdentitiesOnly=yes"`
      : "";

    return { sshUserHost, remoteDir, sshOpt, rsyncSshOpt };
  }
}
