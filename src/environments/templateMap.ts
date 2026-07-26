import { assertSafeVersionString } from "../system/safety.ts";

const TEMPLATE_MAP: Record<string, string> = {
  "wp-existing": "wordpress",
  react: "app",
  nextjs: "app",
};

/** Maps a project type onto the template file that scaffolds it, passing unknown types through unchanged. */
export function resolveTemplateName(type: string): string {
  return TEMPLATE_MAP[type] ?? type;
}

/** Maps a MySQL/MariaDB version onto its Docker image reference. Validates first — the result is templated into generated YAML. */
export function resolveDbImage(mysqlVersion: string): string {
  assertSafeVersionString(mysqlVersion, "mysqlVersion");
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}
