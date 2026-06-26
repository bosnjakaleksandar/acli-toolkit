import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { execAsync } from "../utils/execAsync.js";

/**
 * Imports a staging dump into the local environment and applies URL replacements.
 */
export default class WordPressMigrationService {
  constructor(envService) {
    this.envService = envService;
  }

  /**
   * Starts the local environment, imports a SQL dump, and updates URLs.
   *
   * @param {string} targetDir Local project directory.
   * @param {object} ctx Project context.
   * @param {import("@clack/prompts").Spinner} [spinner] Spinner.
   */
  async importAndReplace(targetDir, ctx, spinner = null) {
    const suffix = process.env.STAGING_SUFFIX || ".staging";
    const localUrl = ctx.environment === "lando" ? `https://${ctx.projectName}.lndo.site` : "http://localhost:8080";

    if (spinner) spinner.message("Starting local environment and importing database...");

    try {
      if (fs.existsSync(path.join(targetDir, "staging.sql"))) {
        if (spinner) spinner.message("Fixing unsupported collations in staging.sql for local compatibility...");
        const sedCmd = [
          "LC_ALL=C sed",
          `-e '1s|/\\*M!999999\\\\- enable the sandbox mode \\*/||'`,
          "-e 's/utf8mb3_uca1400_ai_ci/utf8_general_ci/g'",
          "-e 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_520_ci/g'",
          "-e 's/utf8mb3_/utf8_/g'",
          "staging.sql > staging_fixed.sql && mv staging_fixed.sql staging.sql",
        ].join(" ");
        await execAsync(sedCmd, { cwd: targetDir });
      }

      await this.envService.start(targetDir, spinner);

      if (fs.existsSync(path.join(targetDir, "staging.sql"))) {
        await this.envService.importDb(targetDir, "staging.sql", spinner);
        await this.envService.searchReplace(targetDir, ctx.stagingUrl, localUrl, spinner);
        await this.envService.searchReplace(targetDir, `http://${ctx.projectName}${suffix}`, localUrl, spinner);

        fs.removeSync(path.join(targetDir, "staging.sql"));
      }
    } catch (e) {
      if (spinner) spinner.message(chalk.red("Failed during environment start or db import."));
      console.log(chalk.gray(`│  Import Error: ${e.stderr?.trim() || e.message}`));
      console.log(chalk.gray("│  Suggested fix: start the environment manually and import staging.sql with WP-CLI or your DB tool."));
    }
  }
}
