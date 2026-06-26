import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { execAsync } from "../utils/execAsync.js";

/**
 * Detects and links Git repositories from staging projects.
 */
export default class GitRepositoryService {
  /**
   * Links a local directory to the staging repository when one is detected.
   *
   * @param {string} targetDir Local project directory.
   * @param {object} ctx Project context.
   * @param {object} ssh Resolved SSH options.
   * @param {import("@clack/prompts").Spinner} [spinner] Spinner.
   */
  async linkRepository(targetDir, ctx, ssh, spinner = null) {
    if (spinner) spinner.message("Checking staging environment for Git repository linkage...");

    try {
      const findGitCmd = `
cd ${ctx.projectName} || exit 1
for d in . wordpress wordpress/wp-content/themes/${ctx.projectName}; do
  if [ -d "$d/.git" ]; then
    url=$(git -C "$d" config --get remote.origin.url 2>/dev/null)
    if [ -n "$url" ]; then
      echo "$d|$url"
      exit 0
    fi
  fi
done
exit 1
`.trim();

      const encoded = Buffer.from(findGitCmd).toString("base64");
      const gitInfo = await execAsync(
        `ssh ${ssh.sshOpt} ${ssh.sshUserHost} "echo ${encoded} | base64 -d | bash"`,
        { cwd: targetDir },
      );

      if (!gitInfo) return;

      const [remotePath, gitRemoteUrl] = gitInfo.trim().split("|");
      let localGitDir = targetDir;
      if (remotePath.startsWith("wordpress/")) {
        localGitDir = path.join(targetDir, remotePath.slice("wordpress/".length));
      }

      ctx.stagingRepoUrl = gitRemoteUrl;
      ctx.skipGitInit = true;

      const resolvedKeyPath = ctx.sshKeyPath ? ctx.sshKeyPath.replace(/^~/, process.env.HOME) : "";
      const gitEnv = resolvedKeyPath
        ? {
            ...process.env,
            GIT_SSH_COMMAND: `ssh -i ${resolvedKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no`,
          }
        : process.env;

      fs.ensureDirSync(localGitDir);
      await execAsync("git init", { cwd: localGitDir });
      await execAsync(`git remote add origin ${gitRemoteUrl}`, { cwd: localGitDir });

      if (spinner) spinner.message("Syncing local Git index with remote...");
      try {
        await execAsync("git fetch origin", { cwd: localGitDir, env: gitEnv });
        await execAsync("git remote set-head origin -a", { cwd: localGitDir, env: gitEnv });
        const defaultBranchOut = await execAsync(
          `git symbolic-ref --short refs/remotes/origin/HEAD | sed 's@^origin/@@'`,
          { cwd: localGitDir },
        );
        const defaultBranch = defaultBranchOut.trim() || "main";
        await execAsync(`git reset --mixed origin/${defaultBranch}`, { cwd: localGitDir });
      } catch (syncErr) {
        console.log(chalk.gray(`│  Git Sync Notice: ${syncErr.stderr?.trim() || syncErr.message}`));
      }
    } catch (e) {
      console.log(chalk.gray(`│  Git Remote Check Notice: ${e.stderr?.trim() || e.message}`));
    }
  }
}
