export const WP_CLI_VERSION = "2.12.0";

/** Shell executed inside the WordPress container. Both the PHAR and its
 * published SHA-512 are pinned to the same immutable WP-CLI release. */
export function wpCliInstallShell(): string {
  const base = `https://github.com/wp-cli/wp-cli/releases/download/v${WP_CLI_VERSION}`;
  const phar = `wp-cli-${WP_CLI_VERSION}.phar`;
  return [
    "set -euo pipefail",
    `trap 'rm -f /tmp/${phar} /tmp/${phar}.sha512' EXIT`,
    `curl -fsSLo /tmp/${phar} ${base}/${phar}`,
    `curl -fsSLo /tmp/${phar}.sha512 ${base}/${phar}.sha512`,
    `expected=$(awk '{print $1}' /tmp/${phar}.sha512)`,
    `printf '%s  %s\\n' "$expected" /tmp/${phar} | sha512sum -c -`,
    `install -m 0755 /tmp/${phar} /usr/local/bin/wp`,
  ].join("; ");
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
