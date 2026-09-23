# Commands

Every command also runs from the `acli` menu. Options marked **→** can replace a question; `--yes` (alias `--non-interactive`) turns every remaining question into an error, for scripts and CI.

**Global options** (any command): `--verbose` shows the commands A-CLI runs · `--debug` prints stack traces · `--quiet` hides the banner and animations · `--skip-update` skips the update check · `-v, --version` · `-h, --help`.

## `acli create`

Scaffold a new project. [Guide →](../guide/create)

| Option | |
| --- | --- |
| `--name <name>` | → Project and folder name. |
| `--type <application\|wordpress>` | → Project type. |
| `--framework <react\|nextjs>` | → Application framework (`next` also works). |
| `--laravel` | → Add a Laravel backend. |
| `--wp-type <theme\|woo\|react>` | → WordPress setup (`wp-theme`, `wp-woo`, `wp-react` also work). |
| `--environment <docker\|lando\|none>` | → Local environment (alias `--env`). `none` runs an application natively (the default for applications); WordPress needs `docker` or `lando`. |
| `--mysql <version>` | → MySQL or MariaDB version, e.g. `8.0`, `mariadb:11.4`. |
| `--wp-version <version>` | → WordPress version, or `latest`. |
| `--theme-repo <url>` | → Theme repository (HTTPS or SSH). |
| `--theme-branch <branch>` | → Theme branch. |
| `--ssh-key <path>` | → Key for cloning a private theme repository. |
| `--skip-git` | Don't create a Git repository. |
| `--dry-run` | Print the plan and change nothing. |
| `--resume` | Continue an interrupted run (with the same `--name`). |
| `--config <path>` | Use one explicit configuration file. |
| `--yes` | No questions. |

## `acli import [project]`

Bring a WordPress site from staging into a new local project. `[project]` is the project's name on the server; omit it to pick from the server's list (Coolify). [Guide →](../guide/import-and-pull)

| Option | |
| --- | --- |
| `--profile <name>` | → Which profile (server). Default: your default or only profile. |
| `--name <name>` | → Local folder name. |
| `--environment <docker\|lando>` | → Local environment (alias `--env`). |
| `--mysql <version>` | Local MySQL/MariaDB version (default `8.0`). |
| `--wp-version <version>` | WordPress version for the local environment. |
| `--remote-url <url>` | Another URL to replace with the local one. |
| `--skip-files` | Don't copy files. |
| `--skip-database` | Don't import the database. |
| `--skip-git-link` | Don't connect to the site's Git origin. |
| `--skip-git` | Don't create a Git repository at all. |
| `--keep-dump` | Keep `staging.sql` after importing it. |
| `--dry-run` | Print the plan and change nothing. |
| `--resume` | Continue an interrupted import (A-CLI prints the exact command). |
| `--config <path>` | Use one explicit configuration file. |
| `--yes` | No questions. |

## `acli pull [targets...]`

Refresh an imported (or linked) project. Run it anywhere inside the project. [Guide →](../guide/import-and-pull#pull-updates-later)

Targets: `db`, the profile's folders (`uploads`, `plugins`, `themes`, and `languages` on Coolify), or `full`. No targets: choose from a list (everything with `--yes`).

| Option | |
| --- | --- |
| `--dry-run` | Show what would be pulled. |
| `--keep-dump` | Keep `staging.sql` after a database pull. |
| `--yes` | Don't ask before replacing the local database. |
| `--config <path>` | Use one explicit configuration file. |

## `acli link`

Connect an existing folder to a profile, so `acli pull` works in it.

| Option | |
| --- | --- |
| `--name <name>` | Project name (default: the folder name). |
| `--remote-project <name>` | The project's name on the server, when it differs. |
| `--profile <name>` | → Which profile. |
| `--environment <docker\|lando>` | → Local environment. |
| `--force` | Relink a folder that is already linked. |
| `--config <path>` | Use one explicit configuration file. |
| `--yes` | No questions. |

## `acli profile`

Manage staging profiles. [Guide →](../guide/profiles)

| Command | |
| --- | --- |
| `acli profile create [name]` | Create a profile (options below). |
| `acli profile list [--json]` | List profiles; `*` marks the default. |
| `acli profile current` | Show the default profile. |
| `acli profile use [name] [--clear]` | Set or clear the default profile. |
| `acli profile git-alias <name> [alias] [--clear]` | Set or clear the Git SSH Host alias. |
| `acli profile inspect <name>` | Print a profile (secrets redacted). |
| `acli profile validate <name>` | Check a profile. |
| `acli profile delete <name> [--yes] [--force]` | Delete a profile (`--force` also clears references to it). |

### `acli profile create` options

| Option | |
| --- | --- |
| `--provider <ssh\|coolify-cli>` | → How A-CLI reaches the server (default `ssh`). |
| `--host <host>` | → SSH host. |
| `--port <port>` | → SSH port (default `22`). |
| `--username <user>` | → SSH user; may contain `{projectName}`. |
| `--identity-file <path>` | → SSH private key. |
| `--host-key-policy <strict\|accept-new\|insecure>` | → Host-key checking (default `strict`). |
| `--project-root <path>` | → SSH: the project's folder, e.g. `/srv/projects/{projectName}`. |
| `--wordpress-root <path>` | → SSH: WordPress folder inside it, e.g. `wordpress`. |
| `--directories <list>` | → SSH: `wp-content` folders, e.g. `uploads,plugins,themes`. |
| `--staging-url <url>` | → Extra URL to replace on import. |
| `--git` / `--no-git` | → Link the site's Git repository after import. |
| `--git-ssh-host-alias <alias>` | → Local `~/.ssh/config` alias for Git. |
| `--force` | Replace an existing profile with the same name. |
| `--yes` | No questions. |

## `acli config`

| Command | |
| --- | --- |
| `acli config path` | Print where the user and project configuration files are. |
| `acli config init [--scope user\|project] [--force]` | Write a starter configuration file. |
| `acli config show` | Print the merged configuration (secrets redacted). |
| `acli config validate` | Check every configuration file. |

## `acli update`

| Command | |
| --- | --- |
| `acli update` | Install the latest version globally. |
| `acli update --check` | Only report; exit code 1 when an update is available. |
