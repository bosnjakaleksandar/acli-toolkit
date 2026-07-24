const TEMPLATE_MAP: Record<string, string> = {
  "wp-existing": "wordpress",
  react: "app",
  nextjs: "app",
};

export function resolveTemplateName(type: string): string {
  return TEMPLATE_MAP[type] ?? type;
}

export function resolveDbImage(mysqlVersion: string): string {
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}
