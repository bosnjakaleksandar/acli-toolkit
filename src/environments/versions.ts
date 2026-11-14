import { assertSafeVersionString } from "../system/safety.ts";
import { DEFAULT_MYSQL_VERSION, DEFAULT_PHP_VERSION } from "../config/defaults.ts";

/**
 * Staging is the source of truth for the runtime a local copy needs: a
 * database dumped from MariaDB 10.11 imported into MySQL 8 (or the other
 * way round), or a site running on PHP 7.4 started on PHP 8.3, is the
 * classic way an import or search-replace breaks. These helpers turn the
 * raw version strings a server reports into the short specs the templates
 * use ("mariadb:10.11", "8.0", "8.1").
 */

/**
 * Maps a raw database server version onto a local image spec, or null when it
 * can't be read. Accepts what `SELECT VERSION()` and a dump's
 * "-- Server version" header print:
 *   "10.11.6-MariaDB-0+deb12u1" -> "mariadb:10.11"
 *   "5.5.5-10.6.12-MariaDB"     -> "mariadb:10.6"   (old replication-compat prefix)
 *   "8.0.36-0ubuntu0.22.04.1"   -> "8.0"
 *   "5.7.44-log"                -> "5.7"
 */
export function dbSpecFromServerVersion(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/mariadb/i.test(value)) {
    const match = value.replace(/^5\.5\.5-/, "").match(/^(\d+)\.(\d+)/);
    return match ? `mariadb:${match[1]}.${match[2]}` : null;
  }
  const match = value.match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : null;
}

/** "8.1.27" / "8.2.12-1+ubuntu22.04" / "8.1" -> "8.1"; null when it isn't a PHP version. */
export function phpSpecFromVersion(raw: string | null | undefined): string | null {
  const match = String(raw ?? "").trim().match(/^(\d+)\.(\d+)(?:\.\d+)?(?:[-+~].*)?$/);
  return match ? `${match[1]}.${match[2]}` : null;
}

/** A WordPress core version ("6.5.3", "6.5"), or null. */
export function wpSpecFromVersion(raw: string | null | undefined): string | null {
  const match = String(raw ?? "").trim().match(/^\d+\.\d+(?:\.\d+)?$/);
  return match ? match[0] : null;
}

/** Validates a user-supplied --php value and reduces it to major.minor. */
export function normalizePhpVersion(value: string): string {
  const spec = phpSpecFromVersion(value);
  if (!spec) throw new Error(`Invalid PHP version: ${JSON.stringify(value)} (expected e.g. 8.1).`);
  return spec;
}

/** Reads the "-- Server version" line mysqldump / mariadb-dump write into a dump's header. */
export function serverVersionFromDumpHeader(header: string): string | null {
  return header.match(/^--\s*Server version\s+(\S+)/m)?.[1] ?? null;
}

/** Template values both environment adapters need for the runtime versions. */
export function runtimeTemplateValues({ mysqlVersion, phpVersion, wpVersion }: { mysqlVersion?: string | undefined; phpVersion?: string | undefined; wpVersion: string }): { DB_IMAGE: string; PHP_VERSION: string; WP_IMAGE_TAG: string } {
  const php = phpVersion ? normalizePhpVersion(phpVersion) : null;
  return {
    DB_IMAGE: resolveDbImage(mysqlVersion || DEFAULT_MYSQL_VERSION),
    PHP_VERSION: php ?? DEFAULT_PHP_VERSION,
    WP_IMAGE_TAG: wordpressImageTag(wpVersion, php),
  };
}

/**
 * The official `wordpress` image tag. With a known PHP version the tag
 * pins it ("6.5.3-php8.1-apache", or "php8.1-apache" for latest); without
 * one it stays the bare WordPress version, so projects created without a
 * staging server keep the image's own default PHP as before.
 */
export function wordpressImageTag(wpVersion: string, phpVersion: string | null): string {
  assertSafeVersionString(wpVersion, "wpVersion");
  if (!phpVersion) return wpVersion;
  return wpVersion === "latest" ? `php${phpVersion}-apache` : `${wpVersion}-php${phpVersion}-apache`;
}

/** Maps a MySQL/MariaDB version onto its Docker/Lando image reference. Validates first — the result is templated into generated YAML. */
export function resolveDbImage(mysqlVersion: string): string {
  assertSafeVersionString(mysqlVersion, "mysqlVersion");
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}

/** "mysql:8.0" / "8.0" / "mariadb:10.11" -> a comparable { family, version }. */
export function parseDbSpec(spec: string): { family: "mysql" | "mariadb"; version: string } | null {
  const match = spec.trim().match(/^(?:(mysql|mariadb):)?(\d+\.\d+)/i);
  if (!match) return null;
  return { family: (match[1]?.toLowerCase() as "mysql" | "mariadb" | undefined) ?? "mysql", version: match[2]! };
}

/**
 * The database image a scaffolded project runs, read from its own
 * docker-compose.yaml (services.db.image) or .lando.yml (config.database);
 * null when the file is missing or customized beyond recognition.
 */
export function localDbSpecFromEnvironmentFile(environment: string, content: string, parse: (text: string) => any): string | null {
  try {
    const doc = parse(content);
    const value = environment === "lando" ? doc?.config?.database : doc?.services?.db?.image;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** A warning when the local database server differs from the one a dump came from, else null. */
export function dbMismatchWarning(localSpec: string | null, dumpServerVersion: string | null, environmentFile: string): string | null {
  const local = localSpec ? parseDbSpec(localSpec) : null;
  const stagingSpec = dbSpecFromServerVersion(dumpServerVersion);
  const staging = stagingSpec ? parseDbSpec(stagingSpec) : null;
  if (!local || !staging) return null;
  if (local.family === staging.family && local.version === staging.version) return null;
  return `Local database is ${local.family} ${local.version} but staging runs ${staging.family} ${staging.version}. Set the db image in ${environmentFile} to ${stagingSpec!.includes(":") ? stagingSpec : `mysql:${stagingSpec}`} (then recreate the db volume) so imports behave like staging.`;
}
