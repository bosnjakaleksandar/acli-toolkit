# Import an existing WordPress project

Imports require a declarative profile defining SSH, remote paths, content transfer, database source, Git discovery, source URLs, and local URL. Database drivers are `wp-cli`, `docker`, and `direct`; file transport is `rsync` or `sftp` (through SCP).

Create one interactively with `acli profile create`. When `acli create --existing` is run interactively and no profiles exist, it offers to start this wizard automatically.

After choosing an existing WordPress workflow, A-CLI selects or asks for the staging profile, shows its remote host/database/transport summary, and separately asks whether the generated local project should use Docker or Lando.

```bash
export ACLI_SSH_KEY="$HOME/.ssh/staging"
acli create --existing --name client-site --profile shared-host \
  --config ./examples/config/shared-host.yaml --dry-run --yes
```

Remove `--dry-run` to import. Controls include `--skip-files`, `--skip-database`, `--skip-git-link`, and `--keep-dump`. Preflight checks happen before target creation. Failed imports retain `staging.sql` and report a resume command.

Host-key policy defaults to `strict`; `accept-new` supports automated first connection. Avoid `insecure` outside disposable environments.

## How the database import stays reliable across different servers

See the [Supported Matrix](./supported-matrix.md) for the full reference. Summary: A-CLI prefers facts read directly from the source of truth rather than guessing the table prefix or the live site URL from naming conventions:

- **Table prefix**: with the `wp-cli` database driver, the prefix is read remotely via `wp config get table_prefix` and takes priority over whatever is parsed from the dump. Without `wp-cli` access, it's detected from the dump by checking every table against WordPress's core table names and picking the prefix that covers the *most* of them — not simply the first match, which a plugin table like `wp_gdpr_cc_options` can trigger ahead of the genuine `wp_options`. If no prefix can be determined, the import fails with a clear error instead of silently assuming `wp_`.
- **Site URL**: `urls.staging` in the profile is only ever used as an *additional* search-replace source. The URL that's actually replaced is read back from the freshly imported database itself (`wp option get siteurl`), so migrations work correctly even when the staging URL doesn't follow any particular naming convention, or isn't declared in the profile at all. Both the `http://` and `https://` variant of every source URL are replaced.
- **Collations and cross-database dumps**: the dump is normalized before import — MariaDB's sandbox-mode marker and `CREATE DATABASE`/`USE` statements are stripped (so the dump always lands in the local environment's own database regardless of what the remote database was named), and collations unsupported by the local MySQL/MariaDB image (e.g. newer MariaDB `uca1400` variants) are rewritten to compatible equivalents.
- **Database readiness**: checked at the same path the application actually uses (TCP, app credentials, from the app container) — a database process reporting "started" isn't the same as WordPress actually being able to reach it, and importing before that gap closes was a real source of "Error establishing a database connection" failures.

A failed import always preserves `staging.sql` and prints an exact resume command — it never reports success after a partial or failed migration.

## Daily re-syncs with `acli link` and `acli pull`

`acli create --existing` scaffolds a project, links it to its staging profile, and runs an initial full sync — but real work happens after that first import. Two commands cover the rest of the project's life:

- **`acli link`** connects an *already existing* local directory (one you didn't create with `acli create`, e.g. a checked-out repo) to a staging profile, without touching its files. It writes the same `project:` link that `acli create --existing` writes automatically, and generates a local environment file if one isn't already present.
- **`acli pull [targets...]`** selectively re-syncs a linked project: `acli pull db`, `acli pull uploads plugins themes`, or bare `acli pull` (interactive picker, or every target non-interactively) for a full re-sync. A database pull always asks for confirmation before overwriting your local database unless `--yes` is passed. `--dry-run` prints the resolved plan without changing anything; `--keep-dump` preserves `staging.sql` after a database pull.

```bash
cd client-site
acli link --profile shared-host --environment docker
acli pull db --yes
```

`acli pull` walks up from the current directory to find the nearest linked project, so it works from any subdirectory, not just the project root.
