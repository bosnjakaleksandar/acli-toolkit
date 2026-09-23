# Configuration

Most people never edit configuration by hand: `acli profile create` and `acli import` write it for you. This page is for when you want to look inside.

## Two files

| File | Holds | Written by |
| --- | --- | --- |
| **User config** — `acli config path` prints it (macOS `~/Library/Application Support/a-cli/config.yaml`, Linux `~/.config/a-cli/config.yaml`, Windows `%APPDATA%\a-cli\config.yaml`) | Your [profiles](../guide/profiles), the default profile, and `defaults` for `acli create`. | `acli profile …`, `acli config init` |
| **Project config** — `.acli/config.yaml` in a project | The link to its profile (`project:`), and optionally `defaults` for that project. | `acli import`, `acli link`, `acli pull` |

Profiles live **only** in the user config: they describe how *your* machine reaches a server, with your user and key. A project config that declares profiles or a default profile is refused, so a repository you cloned can't redirect `acli pull` to another server.

Later sources win: built-in defaults → user config → project config → command options. `--config <path>` uses one file instead of both.

Every file starts with `version: 1`. Check them with `acli config validate`, print the merged result with `acli config show`.

## User config

```yaml
version: 1

defaults:
  profile: coolify            # the default profile (acli profile use)
  environment: docker         # used by acli create when you don't pass --environment
  themeRepo: git@github.com:your-org/starter-theme.git
  plugins: [advanced-custom-fields]

profiles:
  coolify:
    provider: coolify-cli
    ssh: { host: cloud.example.com, username: developer, identityFile: ~/.ssh/cloud, hostKeyPolicy: accept-new }
    git: { enabled: true, sshHostAlias: github-work }
    urls: { staging: "https://{projectName}.cloud.example.com" }
```

### `defaults` for `acli create`

Any of these skips the matching question. Values are plain strings, numbers, booleans or lists.

| Key | Example |
| --- | --- |
| `environment` | `docker`, `lando`, or `none` (applications only) |
| `mysqlVersion` | `"8.0"`, `mariadb:11.4` |
| `wpVersion` | `"6.8"` or `latest` |
| `themeRepo` / `themeBranch` | a Git URL / a branch |
| `plugins` | `[advanced-custom-fields, wordpress-seo]` |
| `installWpCli` | `true` |
| `appType`, `framework`, `useLaravel`, `wpType` | the project type answers |

### Profile fields

| Field | Providers | Meaning |
| --- | --- | --- |
| `provider` | — | `ssh` (default) or `coolify-cli`. |
| `ssh.host`, `ssh.port`, `ssh.username` | both | How to log in. `username` may contain `{projectName}`. |
| `ssh.identityFile` | both | Private key path (optional). |
| `ssh.hostKeyPolicy` | both | `strict` (default), `accept-new` or `insecure`. |
| `remote.projectRoot`, `remote.wordpressRoot` | ssh | The project's folder on the server (with `{projectName}`) and the WordPress folder inside it. |
| `files.directories`, `files.excludes` | ssh | `wp-content` folders to sync and patterns to skip. `files.targets` gives each target its own path. |
| `coolify.gitHost` | coolify-cli | Git host for the origin reported by the server (default `github.com`). |
| `git.enabled` | both | Link the site's Git repository after import. |
| `git.sshHostAlias` | both | Local `~/.ssh/config` alias for Git. |
| `git.discoveryPaths` | ssh | Where to look for the site's Git repository (default: the WordPress root and `wp-content/themes/{projectName}`). |
| `urls.staging` | both | Extra URL to replace with the local one. |
| `urls.additionalSearchReplace` | both | More URLs to replace. |
| `database.tablePrefix` | both | Table prefix, when it can't be detected. |
| `database.normalizeCollations` | both | `false` keeps the dump's collations unchanged. |
| `local.url` | both | Local site URL (default `http://localhost:8080`). |

## Project config (`.acli/config.yaml`)

```yaml
version: 1
project:
  name: client-site            # local project name
  type: wordpress
  environment: docker
  profile: coolify             # a profile in your user config
  remoteProject: Client Site   # name on the server, when different
  selections:                  # remembered answers to the server's questions
    database: gk6zccy4rbmh5dlbruv9ypnj
    wordpressContainer: wordpress
  linkedAt: 2026-09-23T17:26:26.330Z
```

`.acli/` is added to the project's `.gitignore` automatically.

## Environment variables

A-CLI doesn't load `.env` files and doesn't expand variables inside configuration — values are used as written. It does read these from your shell:

| Variable | Effect |
| --- | --- |
| `ACLI_VERBOSE=1`, `ACLI_DEBUG=1`, `ACLI_QUIET=1` | Same as `--verbose`, `--debug`, `--quiet`. |
| `ACLI_CONFIG_HOME` | Use another folder for the user config. |
| `ACLI_REDUCED_MOTION=1`, `NO_COLOR=1` | No animations / no colors (also automatic in CI and `TERM=dumb`). |
| `WP_THEME_REPO` | Starter theme offered by `acli create`. |
| `WP_WOO_BRANCH`, `WP_REACT_BRANCH` | Starter theme branches for WooCommerce and React setups. |
