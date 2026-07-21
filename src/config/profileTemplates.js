// Built-in starting points for `acli profile create --template <name>`,
// mirroring the recipes documented in examples/config/*.yaml. A template
// supplies sensible per-field defaults for `acli profile create`'s existing
// prompts/flags — it does not skip them. Connection specifics (host,
// username, project root, staging URL) are still asked normally, shown with
// the template's example as an editable starting point; what a template
// really saves the user from re-deriving is the convention-level choices
// (which database driver, what content directories, how Git discovery
// works) for a given kind of hosting setup.
export const PROFILE_TEMPLATES = {
  "shared-host": {
    label: "Shared host / cPanel (wp-cli over SSH)",
    description: "SSH access with wp-cli available remotely. The most reliable option: table prefix and site URL are read directly from wp-cli instead of guessed from the dump.",
    defaults: {
      host: "staging.example.com",
      port: "22",
      usernameTemplate: "{projectName}",
      identityFile: "${ACLI_SSH_KEY}",
      hostKeyPolicy: "accept-new",
      projectRoot: "/srv/projects/{projectName}",
      wordpressRoot: "wordpress",
      transport: "rsync",
      directories: ["uploads", "plugins", "themes"],
      databaseDriver: "wp-cli",
      stagingUrl: "https://{projectName}.staging.example.com",
      git: true,
    },
  },
  "docker-staging": {
    label: "Docker Compose staging server",
    description: "The remote WordPress stack runs in Docker Compose; the database is dumped via `docker compose exec` against the database service.",
    defaults: {
      host: "staging.example.com",
      port: "22",
      usernameTemplate: "deploy",
      identityFile: "",
      hostKeyPolicy: "strict",
      projectRoot: "/var/www/{projectName}",
      wordpressRoot: "public",
      transport: "rsync",
      directories: ["uploads", "plugins", "themes"],
      databaseDriver: "docker",
      dbService: "db",
      stagingUrl: "https://staging.example.com/{projectName}",
      git: false,
    },
  },
  "direct-database": {
    label: "Direct MySQL/MariaDB connection",
    description: "The database is reachable directly (e.g. a managed database service); no docker/wp-cli access is assumed remotely. Credentials are referenced via ${ENV_VAR} or a secret-manager command, never stored in plain text.",
    defaults: {
      host: "web.example.com",
      port: "22",
      usernameTemplate: "deploy",
      identityFile: "",
      hostKeyPolicy: "strict",
      projectRoot: "/home/deploy/sites/{projectName}",
      wordpressRoot: "web",
      transport: "sftp",
      directories: ["uploads", "themes"],
      databaseDriver: "direct",
      dbHost: "db.internal",
      dbPort: "3306",
      dbUser: "${STAGING_DB_USER}",
      dbPassword: "${STAGING_DB_PASSWORD}",
      dbName: "${STAGING_DB_NAME}",
      stagingUrl: "https://{projectName}.example.com",
      git: true,
    },
  },
};

export function getProfileTemplate(name) {
  return PROFILE_TEMPLATES[name] || null;
}

export function listProfileTemplates() {
  return Object.entries(PROFILE_TEMPLATES).map(([name, template]) => ({ name, label: template.label, description: template.description }));
}
