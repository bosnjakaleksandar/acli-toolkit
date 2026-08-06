export const CONFIG_VERSION = 1;
export const DEFAULT_WORDPRESS_VERSION = "7.0.2";

export const BUILT_IN_PRESETS = Object.freeze({
  wordpress: { setupType: "new", appType: "wordpress", projectType: "wp-theme", wpType: "wp-theme" },
  "wordpress-woo": { setupType: "new", appType: "wordpress", projectType: "wp-woo", wpType: "wp-woo" },
  react: { setupType: "new", appType: "application", framework: "react", projectType: "react", useLaravel: false },
  next: { setupType: "new", appType: "application", framework: "nextjs", projectType: "nextjs", useLaravel: false },
  "laravel-react": { setupType: "new", appType: "application", framework: "react", projectType: "react", useLaravel: true },
  "laravel-next": { setupType: "new", appType: "application", framework: "nextjs", projectType: "nextjs", useLaravel: true },
});

export const BUILT_IN_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  defaults: { mysqlVersion: "8.0", wpVersion: DEFAULT_WORDPRESS_VERSION },
  presets: BUILT_IN_PRESETS,
  profiles: {},
});
