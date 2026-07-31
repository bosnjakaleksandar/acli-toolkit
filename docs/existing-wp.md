# Import an existing WordPress project

`acli import` brings an existing WordPress site into a new local project through a saved [staging profile](./presets.md). The profile describes SSH, remote paths, content transfer, database source, Git discovery, and URLs. Database drivers are `wp-cli`, `docker`, and `direct`; file transport is `rsync` or `sftp` (through SCP).

Create a profile first with `acli profile create` or the Profiles entry in the main menu. A portable profile YAML must be saved with `acli profile import <path>` before import can use it.

Profile selection happens before project questions:

- No configured profiles: import stops with instructions to create one.
- One configured profile: it is selected automatically.
- Several configured profiles: interactive mode asks which one to use; non-interactive mode requires `--profile <name>`.

After profile selection, A-CLI asks for the project name and whether the generated local project should use Docker or Lando, then shows the selected remote host/database/transport summary.

```bash
export ACLI_SSH_KEY="$HOME/.ssh/staging"
acli import --name client-site --profile shared-host \
  --config ./examples/config/shared-host.yaml --dry-run --yes
```

Remove `--dry-run` to import. Controls include `--skip-files`, `--skip-database`, `--skip-git-link`, and `--keep-dump`. Preflight checks happen before target creation. A failed import preserves whatever was already fetched and prints an exact `acli import --resume --name <name>` command to continue from the failed step instead of starting over.

When Git discovery is enabled, import initializes the local repository, adds the discovered `origin`, fetches it, and makes the remote default branch the local baseline/upstream without checking out over imported files. This is deliberately pull-only: A-CLI never commits and never pushes. Use `--skip-git` to disable local Git completely or `--skip-git-link` to initialize a standalone local repository without connecting it to staging's origin.

If your local `~/.ssh/config` uses separate aliases for Git accounts (for example `github-work` and `github-personal`, both pointing to `github.com`), configure the alias on that staging profile:

```bash
acli profile git-alias agency-staging github-work --scope user
acli import --resume --name client-site
```

The profile's optional `git.sshHostAlias` rewrites only the host part of SSH Git URLs (`git@github.com:org/repo.git` → `git@github-work:org/repo.git`). HTTPS URLs are unchanged. This setting is local configuration, not a repository URL that A-CLI pushes to.

Import also prepares `.gitignore` after the Git baseline is available. If the repository already tracks one, its contents and project-specific rules are preserved and missing WordPress/A-CLI patterns are appended. If no tracked file exists, the complete bundled WordPress template is written; import never leaves a one-line `.acli/` placeholder.

Host-key policy defaults to `strict`; `accept-new` supports automated first connection. Avoid `insecure` outside disposable environments. `acli create` never imports an existing site; the compatibility flag `create --existing` exits with instructions to use `acli import`.

## How the database import stays reliable across different servers

See the [Supported Matrix](./supported-matrix.md) for the full reference. Summary: A-CLI prefers facts read directly from the source of truth rather than guessing the table prefix or the live site URL from naming conventions:

- **Table prefix**: with the `wp-cli` database driver, the prefix is read remotely via `wp config get table_prefix` and takes priority over whatever is parsed from the dump. Without `wp-cli` access, it's detected from the dump by checking every table against WordPress's core table names and picking the prefix that covers the *most* of them — not simply the first match, which a plugin table like `wp_gdpr_cc_options` can trigger ahead of the genuine `wp_options`. If no prefix can be determined, the import fails with a clear error instead of silently assuming `wp_`.
- **Site URL**: `urls.staging` in the profile is only ever used as an *additional* search-replace source. The URL that's actually replaced is read back from the freshly imported database itself (`wp option get siteurl`), so migrations work correctly even when the staging URL doesn't follow any particular naming convention, or isn't declared in the profile at all. Both the `http://` and `https://` variant of every source URL are replaced.
- **Collations and cross-database dumps**: the dump is normalized before import — MariaDB's sandbox-mode marker and `CREATE DATABASE`/`USE` statements are stripped (so the dump always lands in the local environment's own database regardless of what the remote database was named), and collations unsupported by the local MySQL/MariaDB image (e.g. newer MariaDB `uca1400` variants) are rewritten to compatible equivalents.
- **Database readiness**: checked at the same path the application actually uses (TCP, app credentials, from the app container) — a database process reporting "started" isn't the same as WordPress actually being able to reach it, and importing before that gap closes was a real source of "Error establishing a database connection" failures.

## Daily re-syncs with `acli link` and `acli pull`

`acli import` scaffolds a project, links it to its staging profile, and runs an initial full sync — but real work happens after that first import. Two commands cover the rest of the project's life:

- **`acli link`** connects an *already existing* local directory (one you didn't create with `acli create`/`acli import`, e.g. a checked-out repo) to a staging profile, without touching its files. It writes the same `project:` link that a profile-based import writes automatically, and generates a local environment file if one isn't already present.
- **`acli pull [targets...]`** selectively re-syncs a linked project: `acli pull db`, `acli pull uploads plugins themes`, or bare `acli pull` (interactive picker, or every target non-interactively) for a full re-sync. A database pull always asks for confirmation before overwriting your local database unless `--yes` is passed. `--dry-run` prints the resolved plan without changing anything; `--keep-dump` preserves `staging.sql` after a database pull.

```bash
cd client-site
acli link --profile shared-host --environment docker
acli pull db --yes
```

`acli pull` walks up from the current directory to find the nearest linked project, so it works from any subdirectory, not just the project root.
