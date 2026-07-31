# Presets and profiles

Presets describe what A-CLI creates. Profiles describe how it connects to an organization's WordPress staging infrastructure.

```bash
acli preset list
acli preset inspect react
```

Named presets and profiles live in user or project configuration. Portable YAML files are accepted by `--preset` and by profile-aware commands such as `link` and `doctor`; `acli import` requires a named configured profile, so save a portable file first with `acli profile import`. Profiles use declarative typed operations; arbitrary scripts are not supported. Complete examples ship in `examples/config`.

Create and manage profiles without editing YAML:

```bash
acli profile create
acli profile list
acli profile inspect agency-staging
acli profile validate agency-staging
acli profile use agency-staging
acli profile current
acli profile rename agency-staging agency-cloud
acli profile delete agency-staging
```

`profile create` starts an interactive wizard. Use `--scope user` to make it globally available or `--scope project` to save it in `.acli/config.yaml`. `profile delete`/`rename`/`import` default to `--scope project`; pass `--scope user` to target the global config instead. `profile rename` also repoints `defaults.profile` and any preset's `profile` field in that same file, so renaming can't leave a dangling reference behind.

A profile describes only the remote staging environment. Docker or Lando remains a separate local-environment choice. `profile list` marks the organizational default with `*`; `profile use` changes it and `profile current` reports it. Import deliberately ignores that default when several profiles exist and asks which one to use.

## Sharing a profile with colleagues

`profile export` prints (or writes) a portable YAML file. A colleague can save it as a named profile with `profile import` before importing a site:

```bash
acli profile export agency-cloud --output agency-cloud.profile.yaml
# ...share the file...
acli profile import ./agency-cloud.profile.yaml         # name inferred from the filename
acli profile import ./agency-cloud.profile.yaml agency  # or choose the saved name explicitly
```

`export` warns (without altering the file) if a sensitive-looking field — like `ssh.identityFile` — holds a literal, machine-specific value instead of a `${ENV_VAR}` reference; replace it before sharing so each colleague can point it at their own key. `import` also accepts a full exported/portable config with multiple `profiles:` entries — pass the one to import as the second argument if the file has more than one.

## Starting from a built-in template

`acli profile create` can start from a built-in template for a common kind of hosting setup — run `acli profile templates` to see them (`shared-host`, `docker-staging`, `direct-database`). A template only pre-fills convention-level choices (database driver, content directories, Git discovery); connection specifics like host and username are still asked normally, shown with the template's example as an editable starting point.

For machines that use separate `~/.ssh/config` aliases per Git account, set a profile-local alias with `acli profile git-alias <profile> <alias> --scope user`, or pass `--git-ssh-host-alias <alias>` while creating the profile. It affects only local SSH Git fetches.

```bash
acli profile templates
acli profile create agency-staging --template shared-host --host staging.agency.example.com
```

## Profile schema notes

`files.targets` names the directories a profile can sync (used by `acli pull [targets...]`), each with its own remote `path` and optional `excludes`/`includes`:

```yaml
files:
  targets:
    uploads: { path: wp-content/uploads, excludes: ["*.log"] }
    plugins: { path: wp-content/plugins }
    themes:  { path: wp-content/themes }
```

Older profiles written with `files.directories`/`files.excludes` are still accepted — they're normalized into this shape automatically. `database.tablePrefix` overrides automatic prefix detection when needed, and `database.normalizeCollations: false` skips the collation-rewriting step for a dump that shouldn't be touched.
