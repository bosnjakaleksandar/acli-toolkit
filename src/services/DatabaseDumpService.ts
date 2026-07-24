import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import { CliError } from "../core/errors.ts";
import type { Spinner } from "./EnvironmentService.ts";

// The set of table names every normal WordPress install has. A dump's real
// prefix is whichever candidate covers the most of these — not just "the
// first table name that happens to end in a core suffix", which plugins
// with names like `wp_gdpr_cc_options` can trigger on ahead of the genuine
// `wp_options` (mysqldump lists tables alphabetically).
const CORE_TABLE_SUFFIXES = ["options", "posts", "postmeta", "users", "usermeta", "comments", "commentmeta", "links"];
const STRONG_COVERAGE_THRESHOLD = 3;

// Matches table names introduced by CREATE TABLE / DROP TABLE / INSERT INTO,
// anchored to the statement so column names (e.g. a `display_options`
// column inside some other table) never get mistaken for a table name.
// Handles backtick-quoted, ANSI double-quoted, and unquoted identifiers.
const TABLE_STATEMENT_PATTERN = /^\s*(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|INSERT\s+INTO)\s+[`"]?([A-Za-z0-9_]+)[`"]?/gim;

export interface RemoteFacts {
  tablePrefix?: string | null;
  siteUrl?: string | null;
}

export default class DatabaseDumpService {
  /**
   * @param targetDir Directory containing staging.sql.
   * @param spinner Optional progress spinner.
   * @param remoteFacts Authoritative facts fetched via RemoteProfileService.getRemoteFacts(), when available.
   */
  async detectTablePrefix(targetDir: string, spinner: Spinner | null = null, remoteFacts: RemoteFacts | null = null): Promise<string> {
    spinner?.message("Detecting WordPress table prefix...");
    const dumpPath = path.join(targetDir, "staging.sql");
    const sql = await fs.readFile(dumpPath, "utf8").catch(() => null);
    const detected = sql ? detectPrefixFromDump(sql) : null;
    const remotePrefix = remoteFacts?.tablePrefix || null;

    if (remotePrefix && detected && remotePrefix !== detected) {
      spinner?.message(chalk.yellow(`Warning: remote table_prefix "${remotePrefix}" does not match the prefix detected in the dump ("${detected}"). Using the remote value.`));
    }

    if (remotePrefix) return remotePrefix;
    if (detected) return detected;

    throw new CliError("Could not detect the WordPress table prefix from the database dump.", {
      code: "TABLE_PREFIX_NOT_DETECTED",
      hint: "Set database.tablePrefix in the profile, or use the wp-cli database driver so the prefix can be read directly from the remote site.",
    });
  }
}

function detectPrefixFromDump(sql: string): string | null {
  const candidates = new Map<string, Set<string>>(); // prefix -> Set of matched core suffixes

  for (const match of sql.matchAll(TABLE_STATEMENT_PATTERN)) {
    const tableName = match[1]!;
    const lowerName = tableName.toLowerCase();
    for (const suffix of CORE_TABLE_SUFFIXES) {
      if (lowerName.endsWith(suffix) && lowerName.length > suffix.length) {
        // Slice from the ORIGINAL (not lowercased) string so a prefix like
        // `WP_` keeps its real case instead of being forced to lowercase.
        const prefix = tableName.slice(0, tableName.length - suffix.length);
        if (!candidates.has(prefix)) candidates.set(prefix, new Set());
        candidates.get(prefix)!.add(suffix);
        break; // suffixes are mutually exclusive (none is a suffix of another)
      }
    }
  }

  if (candidates.size === 0) return null;

  const strong = [...candidates.entries()].filter(([, suffixes]) => suffixes.size >= STRONG_COVERAGE_THRESHOLD);
  const pool = strong.length > 0 ? strong : [...candidates.entries()];

  pool.sort(([prefixA, suffixesA], [prefixB, suffixesB]) => {
    if (suffixesB.size !== suffixesA.size) return suffixesB.size - suffixesA.size; // most core tables covered wins
    if (prefixA.length !== prefixB.length) return prefixA.length - prefixB.length; // shorter prefix wins ties (wp_ over wp_2_)
    return prefixA.localeCompare(prefixB); // fully deterministic as a last resort
  });

  return pool[0]![0];
}
