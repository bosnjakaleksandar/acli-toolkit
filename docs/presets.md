# Presets and profiles

Presets describe what A-CLI creates. Profiles describe how it connects to an organization's WordPress staging infrastructure.

```bash
acli preset list
acli preset inspect react
```

Named presets live in user or project configuration, and a portable preset YAML file is accepted by `--preset`. Profiles live only in your user configuration (see [Configuration](./environment-variables.md)). Complete profile examples ship in `examples/config`.

Create and manage profiles without editing YAML:

```bash
acli profile create
acli profile list
acli profile inspect agency-staging
acli profile validate agency-staging
acli profile use agency-staging
acli profile current
acli profile delete agency-staging
```

`profile create` first asks how A-CLI reaches the server, then only asks for that provider's fields:

- **SSH with wp-cli** (`provider: ssh`, the default): files are synced with rsync and the database is exported with `wp db export` on the server. Asks for the remote project root, the WordPress root and the content directories.
- **Coolify project CLI** (`provider: coolify-cli`): the server's `project` command exports files and database; A-CLI downloads the exports. Asks nothing beyond the SSH connection: the project is chosen at `acli import`, from the server's list.

Every flag has a matching prompt, so `acli profile create agency --provider ssh --host staging.example.com --yes` works non-interactively.

A profile describes only the remote staging environment. Docker or Lando remains a separate local-environment choice. `profile list` marks the default with `*`; `profile use` changes it and `profile current` reports it. Import and link use the default unless `--profile` names another one.

For machines that use separate `~/.ssh/config` aliases per Git account, set a profile-local alias with `acli profile git-alias <profile> <alias>`, or pass `--git-ssh-host-alias <alias>` while creating the profile. It affects only local SSH Git fetches.

## Profile schema notes

`files.targets` names the directories a profile can sync (used by `acli pull [targets...]`), each with its own remote `path` and optional `excludes`/`includes`:

```yaml
files:
  targets:
    uploads: { path: wp-content/uploads, excludes: ["*.log"] }
    plugins: { path: wp-content/plugins }
    themes:  { path: wp-content/themes }
```

This applies to the ssh provider. Profiles written with `files.directories`/`files.excludes` are also accepted — they're normalized into this shape automatically. `database.tablePrefix` overrides automatic prefix detection when needed, and `database.normalizeCollations: false` skips the collation-rewriting step for a dump that shouldn't be touched.
