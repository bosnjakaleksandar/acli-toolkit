# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.1.0] - 2026-09-23

This release narrows `acli import` / `acli pull` to two well-defined ways of reaching a staging server and removes the configuration machinery that existed for one-off setups. `acli create` (React, Next.js, Laravel, WordPress) and the Docker/Lando environments are unchanged.

### Added

- `provider: coolify-cli` profiles for Coolify staging servers that expose only the `project` CLI: imports and pulls use `project db-export`/`project wp-export` plus `scp`, and Git linking uses the repository and deployed branch from `project status`. When the server asks which container or database to use, A-CLI asks the same question and remembers the answer in the project link. See `examples/config/coolify.yaml`.
- `acli pull languages` target (skipped for profiles that don't define it).
- `acli profile create` asks which provider to use and then only that provider's questions; `--provider` selects it non-interactively.
- `acli import [project]`: for a Coolify profile, the project is picked from the server's `project list` (or given as the argument), and the local folder name defaults to it. The project link remembers the server name (`remoteProject`) and prompt answers (`selections`), so `acli pull` doesn't ask again. `acli link --remote-project <name>` does the same for an existing folder.

### Changed

- The documentation site is rewritten and reorganized into Getting started, Create a project, Profiles (with a step-by-step walkthrough for both providers), Import & pull, Commands, Configuration and FAQ, and restyled with the CLI's banner and animated A-CLI Bot. The README is now a short introduction that links to it.
- Remote access is organized as self-contained providers (`src/providers/ssh`, `src/providers/coolify`) behind one contract; the import/pull core no longer branches on the kind of server.
- A Coolify profile describes only the server: `coolify.project` and the `coolify.database*` selections moved to the project link, and profiles that still set them fail validation with instructions.
- Profiles and the default profile live only in the user config. A project `.acli/config.yaml` that declares them is rejected with instructions; it keeps the project link and create defaults/presets.
- `acli import` and `acli link` use the default profile from `acli profile use` when `--profile` isn't given.
- `acli create` now only scaffolds new projects; existing WordPress sites use the separate, profile-backed `acli import` workflow.
- `acli import` validates profiles before asking project questions and automatically selects a sole profile.
- Profile-backed imports fetch the discovered Git origin and track its default (or deployed) branch without checking out over imported files; the success summary reports the linked branch.
- Profiles can define a machine-local `git.sshHostAlias` (or use `acli profile git-alias`) for developers who select different Git identities through `~/.ssh/config`; interrupted imports can safely apply the alias on resume.
- WordPress imports now materialize the complete `.gitignore` template instead of leaving only `.acli/`; when the fetched repository already tracks a `.gitignore`, its project-specific rules remain the base and only missing A-CLI rules are appended.

### Removed

- `acli doctor`. `acli create` and `acli import` already check the tools they need before starting; that check now names each missing or too-old tool with how to install it.
- Presets (`--preset`, the built-in `react`/`next`/`wordpress`/... presets, named and file presets, `acli preset`, and "Save this plan as a reusable preset"), `--from-last` with its `.acli/history.json`, and `--set`. `acli create` takes values from `defaults` in configuration and from its own options, e.g. `--type application --framework react`. An empty leftover `presets: {}` is ignored; a non-empty one fails validation with instructions.
- The ssh provider's `docker` and `direct` database drivers, container discovery by name, and the `sftp` file transport. The ssh provider always exports with wp-cli and syncs with rsync; profiles still using a removed value fail validation with a message saying what to remove.
- `${ENV_VAR}` and `{command: ...}` references in configuration, the project-config trust store, `acli config trust`, and `acli config show --resolved`.
- Profile templates, `acli profile import-legacy`, `profile rename`, `profile import`/`export` of portable files, `--scope` on profile commands, and inline profiles in project links.
- The one-off SSH, local-folder, Git, ZIP, and SQL import sources and their `--source`-specific flags.

### Fixed

- `acli doctor` and remote preflight no longer report SCP as missing: OpenSSH `scp` has no version flag, so it is now only checked for presence.

### Security

- The shared command runner rejects any SSH command that would run a state-changing or interactive remote `project` subcommand (`wp-import`, `db-import`, `db-backup`, `branch`, `deploy`, `shell`, `logs`, admin commands), keeping remote integration pull-only.
- `scp` transfers now honor the profile's `ssh.hostKeyPolicy`, like ssh and rsync already did.
- A-CLI never executes commands from configuration, and a project config found in the working directory can no longer declare staging profiles, so a cloned repository can't redirect a pull to another server.
- A-CLI's shared command runner now rejects both `git push` and the lower-level `git send-pack`; all Git integration is pull-only and publishing remains an explicit manual user action.
- `defaults`/`presets` in configuration are restricted to plain scalar values.
- Fixed several shell/argv injection paths: `GIT_SSH_COMMAND` construction, rsync's `-e` transport, ssh/scp/rsync username and host handling, git remote URLs (`ext::`/leading-dash rejection), and plugin slugs written into a generated install script.
- The generated Docker Compose template no longer publishes WordPress/phpMyAdmin on all network interfaces by default, and phpMyAdmin no longer auto-authenticates.
- The generated Lando template no longer pipes a downloaded install script into a root shell.
- Database dumps (`staging.sql`) and downloaded exports are written with `0600` permissions.
- A-CLI's own verbose/debug logging and error messages redact known credential patterns.
- Generated `.gitignore` templates now exclude `.acli/`, `.env`/`.env.*`, and (Laravel) `auth.json`; `acli link` adds `.acli/` to an existing `.gitignore` if missing.
- Fixed the Laravel `.gitignore` template's anchored rules, which never matched anything because the Laravel app is scaffolded into `backend/`, not the project root.
- CI: the release workflow now verifies a pushed tag's commit is reachable from `main` before publishing; the test workflow declares explicit `permissions: contents: read`.
- The published npm package no longer includes source maps (dead weight — `src/` isn't shipped).

## [2.0.0]

- TypeScript rewrite of the CLI (previously JavaScript).
- Renamed the published npm package to `acli-toolkit`.
