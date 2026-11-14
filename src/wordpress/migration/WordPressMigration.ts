import path from "node:path";
import fs from "fs-extra";
import { CliError, describeError } from "../../core/errors.ts";
import { normalizeSqlDumpFile } from "./sqlNormalization.ts";
import type EnvironmentService from "../../environments/EnvironmentService.ts";
import type { Spinner } from "../../environments/EnvironmentService.ts";

export default class WordPressMigrationService {
  envService: EnvironmentService;

  constructor(envService: EnvironmentService) { this.envService = envService; }

  async importAndReplace(targetDir: string, ctx: any, spinner: Spinner | null = null): Promise<void> {
    const dumpPath = path.join(targetDir, "staging.sql");
    if (!(await fs.pathExists(dumpPath))) throw new CliError("Database export completed without creating staging.sql.", { code: "DUMP_MISSING" });

    try {
      const normalizeCollations = ctx.profile?.database?.normalizeCollations !== false;
      await normalizeSqlDumpFile(dumpPath, { spinner, normalizeCollations });

      await this.envService.start(targetDir, spinner);
      await this.envService.importDb(targetDir, "staging.sql", spinner);

      const localUrl = stripTrailingSlash(this.envService.getLocalUrl(ctx));
      spinner?.message("Reading the imported site's actual URL...");
      // The freshly imported database is the authoritative source for what
      // URL is actually embedded in the content — more reliable than a
      // pre-declared staging URL, which may be stale or follow a convention
      // the profile doesn't document. ctx.stagingUrl and
      // profile.urls.additionalSearchReplace remain as extra fallback
      // sources in case content references older/alternate hostnames too.
      const importedSiteUrl = (await this.envService.wp(targetDir, ["option", "get", "siteurl"], spinner))?.trim() || null;

      const candidates: string[] = [importedSiteUrl, ctx.stagingUrl, ...(ctx.profile?.urls?.additionalSearchReplace || [])].filter(Boolean).map(stripTrailingSlash);
      for (const [from, to] of searchReplacePairs(candidates, localUrl)) await this.envService.searchReplace(targetDir, from, to, spinner);
    } catch (error: any) {
      // The underlying error (e.g. a CommandError from a failed `docker
      // compose exec ... wp ...`) carries the actual stderr/stdout — the
      // real diagnostic. error.message alone is often just "Command failed:
      // <argv>" with no explanation. Fold the real output into the message
      // so it survives being wrapped, instead of silently dropping it.
      throw new CliError(
        `${describeError(error)}\nDatabase dump preserved at ${dumpPath}. Resume with: ${ctx.resumeCommand || `acli import --resume --name ${ctx.projectName}`}`,
        { code: error.code || "MIGRATION_FAILED", hint: error.hint },
      );
    }
  }
}

/**
 * Every (from, to) pair the import runs through `wp search-replace`: each
 * source URL in both schemes, plus its JSON-escaped form (`https:\/\/host`)
 * — page builders such as Elementor and block attributes store URLs that
 * way, and a plain search never matches them, leaving images and links
 * pointing at staging. Longest sources first, so a URL that is a prefix of
 * another (https://site.com vs https://site.com/blog) never pre-empts it.
 * Trailing slashes are dropped on both sides, so a siteurl stored as
 * "https://site.com/" can't turn "https://site.com/wp-content" into
 * "http://localhost:8080wp-content".
 */
export function searchReplacePairs(sources: string[], localUrl: string): Array<[string, string]> {
  const local = stripTrailingSlash(localUrl);
  const urls = new Set<string>();
  for (const url of sources.map(stripTrailingSlash).filter(Boolean)) {
    urls.add(url);
    urls.add(toggleScheme(url));
  }
  urls.delete(local);
  const pairs: Array<[string, string]> = [];
  for (const url of [...urls].sort((a, b) => b.length - a.length)) {
    pairs.push([url, local]);
    const escaped = escapeSlashes(url);
    if (escaped !== url) pairs.push([escaped, escapeSlashes(local)]);
  }
  return pairs;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function escapeSlashes(url: string): string {
  return url.replaceAll("/", "\\/");
}

function toggleScheme(url: string): string {
  if (url.startsWith("https://")) return `http://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
}
