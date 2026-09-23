# Import an existing WordPress project

`acli import` brings an existing WordPress site into a new local project through a saved [staging profile](./profiles.md). A profile uses one of two providers:

- **SSH with wp-cli**: files are synced with rsync and the database is exported with `wp db export` on the server.
- **Coolify project CLI**: the server's `project` command exports files and database (see [Coolify staging servers](#coolify-staging-servers)).

Create a profile first with `acli profile create` or the Profiles entry in the main menu.

Profile selection happens before project questions:

- No configured profiles: import stops with instructions to create one.
- `--profile <name>`, or else the default set with `acli profile use`, is used when given.
- Otherwise one configured profile is selected automatically.
- With several and no default, interactive mode asks which one to use; non-interactive mode requires `--profile <name>`.

After profile selection, A-CLI asks for the project name and whether the generated local project should use Docker or Lando, then shows the selected remote host/database/transport summary.

```bash
acli import --name client-site --profile agency-staging --dry-run --yes
```

Remove `--dry-run` to import. Controls include `--skip-files`, `--skip-database`, `--skip-git-link`, and `--keep-dump`. Preflight checks happen before target creation. A failed import preserves whatever was already fetched and prints an exact `acli import --resume --name <name>` command to continue from the failed step instead of starting over.

When Git discovery is enabled, import initializes the local repository, adds the discovered `origin`, fetches it, and makes the remote default branch the local baseline/upstream without checking out over imported files. This is deliberately pull-only: A-CLI never commits and never pushes. Use `--skip-git` to disable local Git completely or `--skip-git-link` to initialize a standalone local repository without connecting it to staging's origin.

If your local `~/.ssh/config` uses separate aliases for Git accounts (for example `github-work` and `github-personal`, both pointing to `github.com`), configure the alias on that staging profile:

```bash
acli profile git-alias agency-staging github-work
acli import --resume --name client-site
```

The profile's optional `git.sshHostAlias` rewrites only the host part of SSH Git URLs (`git@github.com:org/repo.git` → `git@github-work:org/repo.git`). HTTPS URLs are unchanged. This setting is local configuration, not a repository URL that A-CLI pushes to.

Import also prepares `.gitignore` after the Git baseline is available. If the repository already tracks one, its contents and project-specific rules are preserved and missing WordPress/A-CLI patterns are appended. If no tracked file exists, the complete bundled WordPress template is written; import never leaves a one-line `.acli/` placeholder.

Host-key policy defaults to `strict`; `accept-new` supports automated first connection. Avoid `insecure` outside disposable environments. `acli create` never imports an existing site; the compatibility flag `create --existing` exits with instructions to use `acli import`.

## How the database import stays reliable across different servers

See the [Supported Matrix](./supported-matrix.md) for the full reference. Summary: A-CLI prefers facts read directly from the source of truth rather than guessing the table prefix or the live site URL from naming conventions:

- **Table prefix**: with the ssh provider, the prefix is read remotely via `wp config get table_prefix` and takes priority over whatever is parsed from the dump. Otherwise (Coolify provider, or when that lookup fails), it's detected from the dump by checking every table against WordPress's core table names and picking the prefix that covers the *most* of them — not simply the first match, which a plugin table like `wp_gdpr_cc_options` can trigger ahead of the genuine `wp_options`. If no prefix can be determined, the import fails with a clear error instead of silently assuming `wp_`.
- **Site URL**: `urls.staging` in the profile is only ever used as an *additional* search-replace source. The URL that's actually replaced is read back from the freshly imported database itself (`wp option get siteurl`), so migrations work correctly even when the staging URL doesn't follow any particular naming convention, or isn't declared in the profile at all. Both the `http://` and `https://` variant of every source URL are replaced.
- **Collations and cross-database dumps**: the dump is normalized before import — MariaDB's sandbox-mode marker and `CREATE DATABASE`/`USE` statements are stripped (so the dump always lands in the local environment's own database regardless of what the remote database was named), and collations unsupported by the local MySQL/MariaDB image (e.g. newer MariaDB `uca1400` variants) are rewritten to compatible equivalents.
- **Database readiness**: checked at the same path the application actually uses (TCP, app credentials, from the app container) — a database process reporting "started" isn't the same as WordPress actually being able to reach it, and importing before that gap closes was a real source of "Error establishing a database connection" failures.

## Daily re-syncs with `acli link` and `acli pull`

`acli import` scaffolds a project, links it to its staging profile, and runs an initial full sync — but real work happens after that first import. Two commands cover the rest of the project's life:

- **`acli link`** connects an *already existing* local directory (one you didn't create with `acli create`/`acli import`, e.g. a checked-out repo) to a staging profile, without touching its files. It writes the same `project:` link that a profile-based import writes automatically, and generates a local environment file if one isn't already present.
- **`acli pull [targets...]`** selectively re-syncs a linked project: `acli pull db`, `acli pull uploads plugins themes`, or bare `acli pull` (interactive picker, or every target non-interactively) for a full re-sync. A database pull always asks for confirmation before overwriting your local database unless `--yes` is passed. `--dry-run` prints the resolved plan without changing anything; `--keep-dump` preserves `staging.sql` after a database pull.

```bash
cd client-site
acli link --profile agency-staging --environment docker
acli pull db --yes
```

`acli pull` walks up from the current directory to find the nearest linked project, so it works from any subdirectory, not just the project root.

## Coolify staging servers

When the staging server only exposes the `project` CLI (Coolify), use a profile with `provider: coolify-cli` — see [examples/config/coolify.yaml](https://github.com/bosnjakaleksandar/project-setup/blob/main/examples/config/coolify.yaml). The profile describes only the server (host, SSH user, key, Git alias); one profile serves every project on it. The project is chosen per import:

```bash
acli import                        # pick from the projects the server assigns to you
acli import "Acme Client Site"     # or name it; the local folder defaults to acme-client-site
```

The project's `.acli/config.yaml` remembers its server name (`remoteProject`, when it differs from the local name) and any prompt answers (`selections`), so `acli pull` in that folder needs no arguments. To link an existing folder, use `acli link --remote-project "Acme Client Site"`.

Import and pull then work the same way as with ssh profiles, but each step goes through the server's own exports:

| A-CLI step | Server command |
| --- | --- |
| preflight | `project list`, `project status <project>` (assigned and running) |
| database (`import`, `pull db`) | `project db-export <project> sql.gz`, then `scp` and unpack to `staging.sql` |
| files (`uploads`, `plugins`, `themes`, `languages`) | `project wp-export <project> <component>`, then `scp` and unpack into `wp-content/` |
| Git link | repository and deployed branch from `project status` |

This stays strictly pull-only: A-CLI never sends `wp-import`, `db-import`, `db-backup`, `branch`, `deploy`, `shell` or `logs`, and its shared command runner refuses any SSH command containing them. Downloaded archives are checked before extraction (no absolute paths, `..`, links or unexpected top-level directories) and removed afterwards.

Things to know:

- Every export stays on the server in its backup directory, and developers cannot delete it; ask the server administrator about retention.
- If a project has more than one WordPress or database container, or more than one database, the server asks which one to use. In an interactive run A-CLI asks the same question, passes your answer on, and remembers it in the project's `.acli/config.yaml` (`selections.database`, `selections.databaseName`, `selections.wordpressContainer`), so later pulls don't ask again. With `--yes`/`--non-interactive` it stops with `COOLIFY_SELECTION_REQUIRED` and lists the choices. A-CLI answers the menu by name, never by position.
