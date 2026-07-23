import path from "node:path";
import fs from "fs-extra";
import { CliError, describeError } from "../core/errors.ts";
import { normalizeSqlDump } from "./SqlNormalizationService.ts";

export default class WordPressMigrationService {
  constructor(envService) { this.envService = envService; }

  async importAndReplace(targetDir, ctx, spinner = null) {
    const dumpPath = path.join(targetDir, "staging.sql");
    if (!(await fs.pathExists(dumpPath))) throw new CliError("Database export completed without creating staging.sql.", { code: "DUMP_MISSING" });

    try {
      const sql = await fs.readFile(dumpPath);
      const normalizeCollations = ctx.profile?.database?.normalizeCollations !== false;
      await fs.writeFile(dumpPath, normalizeSqlDump(sql, { spinner, normalizeCollations }));

      await this.envService.start(targetDir, spinner);
      await this.envService.importDb(targetDir, "staging.sql", spinner);

      const localUrl = this.envService.getLocalUrl(ctx);
      spinner?.message("Reading the imported site's actual URL...");
      // The freshly imported database is the authoritative source for what
      // URL is actually embedded in the content — more reliable than a
      // pre-declared staging URL, which may be stale or follow a convention
      // the profile doesn't document. ctx.stagingUrl and
      // profile.urls.additionalSearchReplace remain as extra fallback
      // sources in case content references older/alternate hostnames too.
      const importedSiteUrl = (await this.envService.wp(targetDir, ["option", "get", "siteurl"], spinner))?.trim() || null;

      const candidates = [importedSiteUrl, ctx.stagingUrl, ...(ctx.profile?.urls?.additionalSearchReplace || [])].filter(Boolean);
      const sourceUrls = new Set();
      for (const url of candidates) {
        sourceUrls.add(url);
        sourceUrls.add(toggleScheme(url));
      }
      sourceUrls.delete(localUrl);

      for (const source of sourceUrls) await this.envService.searchReplace(targetDir, source, localUrl, spinner);
    } catch (error) {
      // The underlying error (e.g. a CommandError from a failed `docker
      // compose exec ... wp ...`) carries the actual stderr/stdout — the
      // real diagnostic. error.message alone is often just "Command failed:
      // <argv>" with no explanation. Fold the real output into the message
      // so it survives being wrapped, instead of silently dropping it.
      throw new CliError(
        `${describeError(error)}\nDatabase dump preserved at ${dumpPath}. Resume with: acli create --preset ${ctx.presetName || "<preset>"} --profile ${ctx.profile?.profileName || "<profile>"} --name ${ctx.projectName} --skip-files --keep-dump`,
        { code: error.code || "MIGRATION_FAILED", hint: error.hint },
      );
    }
  }
}

function toggleScheme(url) {
  if (url.startsWith("https://")) return `http://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
}
