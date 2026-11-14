import { dbSpecFromServerVersion, normalizePhpVersion, phpSpecFromVersion, wpSpecFromVersion } from "../../environments/versions.ts";
import { DEFAULT_MYSQL_VERSION, DEFAULT_PHP_VERSION, DEFAULT_WORDPRESS_VERSION } from "../../config/defaults.ts";
import type { RemoteFacts } from "../../core/model/RemoteFacts.ts";

export interface RuntimeVersions {
  mysqlVersion: string;
  phpVersion: string;
  wpVersion: string;
}

export interface ResolvedRuntimeVersions extends RuntimeVersions {
  /** Where each value came from, for the summary/warnings. */
  sources: Record<keyof RuntimeVersions, "flag" | "staging" | "default">;
  warnings: string[];
}

/**
 * Decides the local runtime versions for an imported site, in order:
 * an explicit flag (--mysql/--php/--wp-version), then what the staging
 * server reports (live via wp-cli, or the dump's own header for the
 * database), then the configured/built-in default. Falling back to a
 * default is warned about, because a mismatch is what breaks imports.
 */
export function resolveRuntimeVersions({
  requested = {},
  facts = null,
  dumpServerVersion = null,
  fallbacks = {},
}: {
  requested?: Partial<Record<keyof RuntimeVersions, string | undefined>>;
  facts?: Partial<RemoteFacts> | null;
  dumpServerVersion?: string | null;
  fallbacks?: Partial<Record<keyof RuntimeVersions, string | undefined>>;
}): ResolvedRuntimeVersions {
  const warnings: string[] = [];
  const sources = {} as ResolvedRuntimeVersions["sources"];

  const pick = (key: keyof RuntimeVersions, staging: string | null, fallback: string, label: string, flag: string): string => {
    if (requested[key]) { sources[key] = "flag"; return requested[key]!; }
    if (staging) { sources[key] = "staging"; return staging; }
    sources[key] = "default";
    warnings.push(`Could not read the staging ${label}; using ${fallback}. Pass ${flag} to match staging.`);
    return fallback;
  };

  const mysqlVersion = pick("mysqlVersion", dbSpecFromServerVersion(facts?.dbVersion) ?? dbSpecFromServerVersion(dumpServerVersion), fallbacks.mysqlVersion || DEFAULT_MYSQL_VERSION, "database version", "--mysql");
  const phpVersion = pick("phpVersion", phpSpecFromVersion(facts?.phpVersion), fallbacks.phpVersion || DEFAULT_PHP_VERSION, "PHP version", "--php");
  const wpVersion = pick("wpVersion", wpSpecFromVersion(facts?.wpVersion), fallbacks.wpVersion || DEFAULT_WORDPRESS_VERSION, "WordPress version", "--wp-version");

  return { mysqlVersion, phpVersion: normalizePhpVersion(phpVersion), wpVersion, sources, warnings };
}

/** One line for the summary, e.g. "PHP 8.1 · mariadb:10.11 · WordPress 6.5.3 (from staging)". */
export function describeRuntimeVersions(versions: ResolvedRuntimeVersions): string {
  const tag = (key: keyof RuntimeVersions) => (versions.sources[key] === "staging" ? "" : ` (${versions.sources[key]})`);
  return `PHP ${versions.phpVersion}${tag("phpVersion")} · DB ${versions.mysqlVersion}${tag("mysqlVersion")} · WordPress ${versions.wpVersion}${tag("wpVersion")}`;
}
