export const CONFIG_VERSION = 1;
export const DEFAULT_WORDPRESS_VERSION = "7.0.2";
/** Used only when the staging server's version can't be read (and for new projects). */
export const DEFAULT_MYSQL_VERSION = "8.0";
export const DEFAULT_PHP_VERSION = "8.3";

export const BUILT_IN_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  defaults: { mysqlVersion: DEFAULT_MYSQL_VERSION, wpVersion: DEFAULT_WORDPRESS_VERSION },
  profiles: {},
});
