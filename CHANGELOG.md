# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `acli create` now only scaffolds new projects; existing WordPress sites use the separate, profile-backed `acli import` workflow.
- The interactive main menu now exposes Profiles as the third action, with create/import/export/list/default/delete management.
- `acli import` validates profiles before asking project questions, automatically selects a sole profile, and asks when several are configured.
- Profile-backed imports now fetch the discovered Git origin and track its default branch without checking out over imported files; the success summary reports the observed linked branch instead of incorrectly saying `Not initialized`.
- Profiles can define a machine-local `git.sshHostAlias` (or use `acli profile git-alias`) for developers who select different Git identities through `~/.ssh/config`; interrupted imports can safely apply the alias on resume.
- WordPress imports now materialize the complete `.gitignore` template instead of leaving only `.acli/`; when the fetched repository already tracks a `.gitignore`, its project-specific rules remain the base and only missing A-CLI rules are appended.

### Removed

- Removed the one-off SSH, local-folder, Git, ZIP, and SQL import sources and their `--source`-specific flags. Portable profile YAML must be saved with `acli profile import` before use.

### Security

- A-CLI's shared command runner now rejects both `git push` and the lower-level `git send-pack`; all Git integration is pull-only and publishing remains an explicit manual user action.
- Project-scoped `.acli/config.yaml` secret references (`{command: ...}` / `${ENV_VAR}`) now require the file to be trusted before A-CLI will resolve them — content-hash-pinned, auto-trusted for anything A-CLI itself wrote. See [SECURITY.md](SECURITY.md). New `acli config trust` command.
- `defaults`/`presets` in configuration are now restricted to plain scalar values, closing a path for hiding a secret-command reference under an arbitrary key.
- Fixed several shell/argv injection paths: `GIT_SSH_COMMAND` construction, rsync's `-e` transport, ssh/scp/rsync username and host handling, git remote URLs (`ext::`/leading-dash rejection), and plugin slugs written into a generated install script.
- The generated Docker Compose template no longer publishes WordPress/phpMyAdmin on all network interfaces by default, and phpMyAdmin no longer auto-authenticates.
- The generated Lando template no longer pipes a downloaded install script into a root shell.
- Database dumps (`staging.sql`), exported profiles, and temporary SSH profile files are now written with `0600` permissions.
- A staging database password is no longer passed as a `-p<password>` CLI argument (uses `MYSQL_PWD` instead); A-CLI's own verbose/debug logging and error messages now redact known credential patterns.
- Generated `.gitignore` templates now exclude `.acli/`, `.env`/`.env.*`, and (Laravel) `auth.json`; `acli link` adds `.acli/` to an existing `.gitignore` if missing.
- Fixed the Laravel `.gitignore` template's anchored rules, which never matched anything because the Laravel app is scaffolded into `backend/`, not the project root.
- CI: the release workflow now verifies a pushed tag's commit is reachable from `main` before publishing; the test workflow declares explicit `permissions: contents: read`.
- The published npm package no longer includes source maps (dead weight — `src/` isn't shipped).

## [2.0.0]

- TypeScript rewrite of the CLI (previously JavaScript).
- Renamed the published npm package to `acli-toolkit`.
