/**
 * Authoritative values read directly from a remote WordPress install (via
 * wp-cli over SSH), used in place of guessing them from a database dump's
 * own contents. Either field is null when the provider can't report it
 * (the Coolify provider has no `wp` access, or a lookup failed); import
 * then falls back to dump-based detection.
 */
export interface RemoteFacts {
  tablePrefix: string | null;
  siteUrl: string | null;
  /** PHP version wp-cli runs under on the server, e.g. "8.1.27". */
  phpVersion?: string | null;
  /** The database server's `SELECT VERSION()`, e.g. "10.11.6-MariaDB-0+deb12u1". */
  dbVersion?: string | null;
  /** WordPress core version, e.g. "6.5.3". */
  wpVersion?: string | null;
}
