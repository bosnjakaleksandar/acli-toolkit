const TEMPLATE_MAP: Record<string, string> = {
  "wp-existing": "wordpress",
  react: "app",
  nextjs: "app",
};

export function resolveTemplateName(type: string): string {
  return TEMPLATE_MAP[type] ?? type;
}

// DockerComposeService/LandoService template mysqlVersion/wpVersion/tablePrefix
// into generated YAML via a raw string replace, with no YAML-aware escaping.
// A value containing a newline (or other YAML-structural characters) would
// inject arbitrary keys into docker-compose.yaml/.lando.yml. These three
// values only ever need to express a version tag ("8.0", "latest",
// "mariadb:11.4") or a SQL identifier prefix — restricting them to that
// shape closes the injection off at the source.
const SAFE_VERSION_STRING = /^[a-zA-Z0-9_.:-]+$/;
const SAFE_TABLE_PREFIX = /^[A-Za-z0-9_]+$/;

export function resolveDbImage(mysqlVersion: string): string {
  if (typeof mysqlVersion !== "string" || !SAFE_VERSION_STRING.test(mysqlVersion)) {
    throw new Error(`Unsafe mysqlVersion value: ${JSON.stringify(mysqlVersion)}`);
  }
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}

export function assertSafeWpVersion(wpVersion: string): string {
  if (typeof wpVersion !== "string" || !SAFE_VERSION_STRING.test(wpVersion)) {
    throw new Error(`Unsafe wpVersion value: ${JSON.stringify(wpVersion)}`);
  }
  return wpVersion;
}

export function assertSafeTablePrefix(tablePrefix: string): string {
  if (typeof tablePrefix !== "string" || !SAFE_TABLE_PREFIX.test(tablePrefix)) {
    throw new Error(`Unsafe database table prefix: ${JSON.stringify(tablePrefix)}`);
  }
  return tablePrefix;
}
