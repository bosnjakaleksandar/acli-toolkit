# Security Policy

## Supported versions

Only the latest published version of `acli-toolkit` on npm receives security fixes. There is no long-term-support branch — please upgrade (`npm install -g acli-toolkit@latest`) before reporting an issue to confirm it still reproduces.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security report.

Instead, use one of:

- [GitHub Security Advisories](https://github.com/bosnjakaleksandar/project-setup/security/advisories/new) for this repository (preferred — keeps the report private until a fix ships), or
- Email **bosnjakaleksandar02@gmail.com** with a description of the issue, steps to reproduce, and its potential impact.

This is a solo-maintained project. Please allow a few days for an initial response. Once a fix is available, it will be released and the advisory (if one was filed) will be published with credit to the reporter, unless you ask to remain anonymous.

## What A-CLI reads from a repository

A-CLI auto-discovers `.acli/config.yaml` in the current project, the way `make` reads a `Makefile`. Since 2.1 that file can hold only the project link and `acli create` defaults:

- A-CLI never executes commands from configuration; `{command: ...}` and `${ENV_VAR}` references are rejected rather than resolved.
- Staging profiles (hosts, users, keys) and the default profile are read only from your user config. A project config that declares them is refused, so a cloned repository can't make `acli pull` connect to a different server.
- Create defaults can still name a starter-theme repository to clone, so review `.acli/config.yaml` in a repository you don't trust before running `acli create` there.

## Pull-only remote access

Import and pull never change the remote site:

- The shared command runner rejects `git push` and `git send-pack`.
- It also rejects any SSH command that would run a state-changing or interactive subcommand of a Coolify server's `project` CLI (`wp-import`, `db-import`, `db-backup`, `branch`, `deploy`, `shell`, `logs`, admin commands); the Coolify provider additionally sends only an allow-list of read-only subcommands.
- Downloaded archives are checked before extraction (no absolute paths, `..`, links or unexpected entries).

## Scope

This policy covers the `acli-toolkit` CLI itself (this repository). It does not cover:

- Vulnerabilities in projects A-CLI scaffolds (WordPress core, Laravel, npm packages pulled in by `create-vite`/`create-next-app`/`composer create-project`, etc.) — report those upstream.
- Misconfiguration of infrastructure you point A-CLI at (weak SSH keys, exposed staging servers, etc.).
