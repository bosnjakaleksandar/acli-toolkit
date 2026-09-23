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
}
