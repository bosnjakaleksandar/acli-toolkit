/**
 * Authoritative values read directly from a remote WordPress install (via
 * wp-cli over SSH), used in place of guessing them from a database dump's
 * own contents. Either field is null when the source can't report it — e.g.
 * a non-wp-cli database driver, where `wp` isn't guaranteed to exist
 * remotely, falls back to dump-based detection.
 */
export interface RemoteFacts {
  tablePrefix: string | null;
  siteUrl: string | null;
}
