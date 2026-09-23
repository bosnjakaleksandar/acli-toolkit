import { assertSafeVersionString } from "../system/safety.ts";

const TEMPLATE_MAP: Record<string, string> = {
  "wp-existing": "wordpress",
  next: "nextjs",
};

/** Maps a project type onto the template file that scaffolds it, passing unknown types through unchanged. */
export function resolveTemplateName(type: string): string {
  return TEMPLATE_MAP[type] ?? type;
}

/** How a project's frontend dev server listens inside a container: Vite for React, next dev for Next.js. */
export function frontendDevServer(framework?: string | null): { port: string; command: string } {
  return framework === "nextjs"
    ? { port: "3000", command: "npm run dev -- --hostname 0.0.0.0 --port 3000" }
    : { port: "5173", command: "npm run dev -- --host 0.0.0.0 --port 5173" };
}

/** Maps a MySQL/MariaDB version onto its Docker image reference. Validates first — the result is templated into generated YAML. */
export function resolveDbImage(mysqlVersion: string): string {
  assertSafeVersionString(mysqlVersion, "mysqlVersion");
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}
