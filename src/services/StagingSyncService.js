import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { execAsync } from "../utils/execAsync.js";

/**
 * Synchronizes WordPress content directories from staging.
 */
export default class StagingSyncService {
  /**
   * Pulls uploads, plugins, and themes from a staging host.
   *
   * @param {string} targetDir Local project directory.
   * @param {object} ssh Resolved SSH options.
   * @param {import("@clack/prompts").Spinner} [spinner] Spinner.
   */
  async pullRemoteFiles(targetDir, ssh, spinner = null) {
    if (spinner) spinner.message(`Pulling uploads, plugins, and themes from ${ssh.sshUserHost}...`);

    const wpContentDirs = ["uploads", "plugins", "themes"];
    for (const dir of wpContentDirs) {
      await fs.ensureDir(path.join(targetDir, "wp-content", dir));
    }

    try {
      for (const dir of wpContentDirs) {
        if (spinner) spinner.message(`Syncing wp-content/${dir}...`);
        const onProgress = spinner ? (line) => spinner.message(`Rsync (${dir}): ${line}`) : null;
        await execAsync(
          `rsync -avz --exclude='*.log' --exclude='node_modules' ${ssh.rsyncSshOpt} ${ssh.sshUserHost}:${ssh.remoteDir}/wp-content/${dir}/ wp-content/${dir}/`,
          { cwd: targetDir },
          onProgress,
        );
      }
    } catch (e) {
      if (spinner) spinner.message(chalk.red("Failed to pull some files via rsync. Continuing..."));
      console.log(chalk.gray(`│  Rsync Error: ${e.stderr?.trim() || e.message}`));
      console.log(chalk.gray("│  Suggested fix: verify SSH access, rsync availability, and the staging wp-content path."));
    }
  }
}
