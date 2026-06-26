import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { execAsync } from "../utils/execAsync.js";

/**
 * Handles staging database export and local dump preparation.
 */
export default class DatabaseDumpService {
  /**
   * Exports and downloads a staging database dump.
   *
   * @param {string} targetDir Local project directory.
   * @param {object} ctx Project context.
   * @param {object} ssh Resolved SSH options.
   * @param {import("@clack/prompts").Spinner} [spinner] Spinner.
   */
  async exportDatabase(targetDir, ctx, ssh, spinner = null) {
    if (spinner) spinner.message("Exporting and downloading database from staging...");

    try {
      const dumpCommand = `
cd ${ctx.projectName} || exit 1
DBCONTAINER=$(docker ps --format '{{.Names}}' | grep -i '${ctx.projectName}' | grep -iE 'db|mariadb|mysql' | head -n 1)
if [ -z "$DBCONTAINER" ]; then echo "DB Container not found" >&2; exit 1; fi
echo "Using container: $DBCONTAINER" >&2
USER=$(grep -E '^(DB_USER|MYSQL_USER)=' .env | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\\r')
PASS=$(grep -E '^(DB_PASSWORD|MYSQL_PASSWORD)=' .env | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\\r')
NAME=$(grep -E '^(DB_NAME|MYSQL_DATABASE)=' .env | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\\r')
echo "DB: $NAME, USER: $USER" >&2
docker exec "$DBCONTAINER" mariadb-dump -u"$USER" -p"$PASS" "$NAME" 2>/dev/null
`.trim();

      const encoded = Buffer.from(dumpCommand).toString("base64");
      const result = await execAsync(
        `ssh ${ssh.sshOpt} ${ssh.sshUserHost} "echo ${encoded} | base64 -d | bash"`,
        { cwd: targetDir, maxBuffer: 1024 * 1024 * 512 },
      );

      if (!result || result.length < 100) {
        throw new Error(`Dump is empty or too small (${result?.length} bytes)`);
      }

      fs.writeFileSync(path.join(targetDir, "staging.sql"), result);
      if (spinner) spinner.message(chalk.green(`Database dump saved to staging.sql (${(result.length / 1024 / 1024).toFixed(2)} MB)`));
    } catch (e) {
      if (spinner) spinner.message(chalk.red("Failed to export/download database."));
      console.log(chalk.gray(`│  DB Dump Error: ${e.stderr?.trim() || e.message}`));
      console.log(chalk.gray("│  Suggested fix: confirm staging Docker containers are running and database env vars exist."));
    }
  }

  /**
   * Detects the WordPress SQL table prefix from a downloaded dump.
   *
   * @param {string} targetDir Local project directory.
   * @param {import("@clack/prompts").Spinner} [spinner] Spinner.
   * @returns {Promise<string>}
   */
  async detectTablePrefix(targetDir, spinner = null) {
    if (spinner) spinner.message("Detecting WordPress table prefix...");
    try {
      const grepOut = await execAsync(
        "grep -m 1 -oE '\\`[a-zA-Z0-9_]+postmeta\\`' staging.sql || true",
        { cwd: targetDir },
      );
      const match = grepOut.trim().match(/`([a-zA-Z0-9_]+)postmeta`/);
      if (match?.[1]) return match[1];
    } catch {
      // Keep default prefix when the dump is missing or cannot be inspected.
    }
    return "wp_";
  }
}
