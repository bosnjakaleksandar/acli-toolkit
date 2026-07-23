# Import an existing WordPress project

`acli import` brings an existing WordPress site into a new local project. It supports several sources via `--source`:

- **`profile`** (default) — a saved [staging profile](./presets.md) describing SSH, remote paths, content transfer, database source, Git discovery, and URLs. Database drivers are `wp-cli`, `docker`, and `direct`; file transport is `rsync` or `sftp` (through SCP).
- **`ssh`** — a one-off SSH target with no saved profile: `--ssh-host`, `--ssh-user`, `--remote-path`, and optionally `--ssh-port`/`--ssh-key`/`--db-driver`/`--remote-url`.
- **`local`** — copy WordPress files already on this machine: `--local-path <path>`.
- **`git`** — clone a repository containing a `wp-content` directory: `--repo <url>` (optionally `--branch`).
- **`zip`** — extract a `.zip` archive containing `wp-content` (e.g. a hosting-panel export): `--zip <path>`. Requires the `unzip` command.
- **`sql`** — import only a database dump, with no file sync at all.

`local`, `git`, `zip`, and `sql` all accept `--sql-file <path>` for the database dump, and `--remote-url` as an extra search-replace source.

Create a profile interactively with `acli profile create`. When `acli import --source profile` is run interactively and no profiles exist, it offers to start this wizard automatically.

After choosing a profile, A-CLI shows its remote host/database/transport summary and separately asks whether the generated local project should use Docker or Lando.

```bash
export ACLI_SSH_KEY="$HOME/.ssh/staging"
acli import --name client-site --profile shared-host \
  --config ./examples/config/shared-host.yaml --dry-run --yes
```

```bash
# A local WordPress backup, no remote host involved
acli import --source local --name client-site --environment docker \
  --local-path ~/Downloads/client-site-backup --sql-file ~/Downloads/client-site.sql
```

Remove `--dry-run` to import. Controls include `--skip-files`, `--skip-database`, `--skip-git-link` (profile/ssh only), and `--keep-dump`. Preflight checks happen before target creation. A failed import preserves whatever was already fetched and prints an exact `--resume` command to continue from the step that failed, instead of starting over — it never reports success after a partial or failed migration.

Host-key policy for profile-based sources defaults to `strict`; `accept-new` supports automated first connection. Avoid `insecure` outside disposable environments.

`create --existing` still works — it's a deprecated alias for `acli import --source profile`.

## How the database import stays reliable across different servers

See the [Supported Matrix](./supported-matrix.md) for the full reference. Summary: A-CLI prefers facts read directly from the source of truth rather than guessing the table prefix or the live site URL from naming conventions:

- **Table prefix**: with the `wp-cli` database driver, the prefix is read remotely via `wp config get table_prefix` and takes priority over whatever is parsed from the dump. Without `wp-cli` access, it's detected from the dump by checking every table against WordPress's core table names and picking the prefix that covers the *most* of them — not simply the first match, which a plugin table like `wp_gdpr_cc_options` can trigger ahead of the genuine `wp_options`. If no prefix can be determined, the import fails with a clear error instead of silently assuming `wp_`.
- **Site URL**: `urls.staging` in the profile is only ever used as an *additional* search-replace source. The URL that's actually replaced is read back from the freshly imported database itself (`wp option get siteurl`), so migrations work correctly even when the staging URL doesn't follow any particular naming convention, or isn't declared in the profile at all. Both the `http://` and `https://` variant of every source URL are replaced.
- **Collations and cross-database dumps**: the dump is normalized before import — MariaDB's sandbox-mode marker and `CREATE DATABASE`/`USE` statements are stripped (so the dump always lands in the local environment's own database regardless of what the remote database was named), and collations unsupported by the local MySQL/MariaDB image (e.g. newer MariaDB `uca1400` variants) are rewritten to compatible equivalents.
- **Database readiness**: checked at the same path the application actually uses (TCP, app credentials, from the app container) — a database process reporting "started" isn't the same as WordPress actually being able to reach it, and importing before that gap closes was a real source of "Error establishing a database connection" failures.

## Daily re-syncs with `acli link` and `acli pull`

`acli import --source profile` scaffolds a project, links it to its staging profile, and runs an initial full sync — but real work happens after that first import. Two commands cover the rest of the project's life:

- **`acli link`** connects an *already existing* local directory (one you didn't create with `acli create`/`acli import`, e.g. a checked-out repo) to a staging profile, without touching its files. It writes the same `project:` link that a profile-based import writes automatically, and generates a local environment file if one isn't already present.
- **`acli pull [targets...]`** selectively re-syncs a linked project: `acli pull db`, `acli pull uploads plugins themes`, or bare `acli pull` (interactive picker, or every target non-interactively) for a full re-sync. A database pull always asks for confirmation before overwriting your local database unless `--yes` is passed. `--dry-run` prints the resolved plan without changing anything; `--keep-dump` preserves `staging.sql` after a database pull.

```bash
cd client-site
acli link --profile shared-host --environment docker
acli pull db --yes
```

`acli pull` walks up from the current directory to find the nearest linked project, so it works from any subdirectory, not just the project root.
