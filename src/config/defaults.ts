export const CONFIG_VERSION = 1;
export const DEFAULT_WORDPRESS_VERSION = "7.0.2";

export const BUILT_IN_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  defaults: { mysqlVersion: "8.0", wpVersion: DEFAULT_WORDPRESS_VERSION },
  profiles: {},
});
