const TEMPLATE_MAP = {
  "wp-existing": "wordpress",
  react: "app",
  nextjs: "app",
};

export function resolveTemplateName(type) {
  return TEMPLATE_MAP[type] ?? type;
}

export function resolveDbImage(mysqlVersion) {
  return mysqlVersion.includes("mariadb")
    ? mysqlVersion
    : `mysql:${mysqlVersion}`;
}
