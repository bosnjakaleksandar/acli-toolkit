# CLI Options

## Global options

These apply to every command, not just `create`:

- `-v, --version` — print the installed version
- `-h, --help` — list commands and options
- `--skip-update` — bypass the automatic update check for this run
- `--verbose` — show commands and detailed progress
- `--debug` — show debug details and stack traces on failure
- `--quiet` — suppress decorative output

Running `acli` with no arguments opens an interactive menu in this order: Create, Import, Profiles, Link, Pull. Profiles opens a submenu for creating, listing, selecting a default, setting a Git SSH alias, and deleting staging profiles.

`acli update` installs the latest published version globally. `acli update --check` reports whether one is available (exit code 1 if so) without installing anything — useful for scripting.

## `create` options

Interactive mode is still the default:

```bash
acli create
```

Pass partial options to skip prompts for values you already know. The CLI asks only for missing choices:

```bash
acli create --name my-app
acli create --name my-app --type application --framework react
acli create --name salon --type wordpress --wp-type theme --environment lando
```

`--environment` only applies to WordPress projects — React/Next.js/Laravel are scaffolded by their own official generators and run via their own dev servers, so no local environment choice is needed for them.

Use `--yes` or `--non-interactive` when automation should fail instead of asking questions:

```bash
acli create --type application --framework nextjs --laravel --name booking-app --yes
```

To bring in an *existing* WordPress site rather than scaffolding a new one, use `acli import` instead — see [Import an existing WordPress project](./existing-wp.md). The compatibility flag `create --existing` now exits with a usage error and points to `acli import`; it never starts an import.

Values in `defaults` in your configuration are used unless an option overrides them, so a team can set its starter theme once:

```yaml
defaults:
  themeRepo: git@github.com:your-org/starter-theme.git
  plugins: [advanced-custom-fields]
```

## Examples

```bash
acli create --name my-app --type application --framework react
acli create --name salon --type wordpress --wp-type theme --environment lando
acli create --type application --framework nextjs --laravel --name booking-app
```

## Reference

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--config <path>`
- `--dry-run`
- `--resume`
- `--existing` (compatibility error only — use `acli import`)
- `--type <application|wordpress>`
- `--framework <react|nextjs|next>`
- `--laravel`
- `--wp-type <theme|woo|react|wp-theme|wp-woo|wp-react>`
- `--mysql <version>`
- `--wp-version <version>`
- `--theme-repo <url>`
- `--theme-branch <branch>`
- `--ssh-key <path>`
- `--skip-git`
- `--yes` or `--non-interactive`

## `import` options

`acli import` only imports through a named staging profile from your user configuration. Create one with `acli profile create`.

With no profiles the command fails before asking project questions. `--profile` or the default profile (`acli profile use`) is used when set; otherwise a sole profile is selected automatically. With several and no default, interactive mode asks which one to use; `--yes`/`--non-interactive` requires `--profile <name>`.

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--profile <name>`
- `--config <path>`
- `--mysql <version>`
- `--wp-version <version>`
- `--remote-url <url>`
- `--dry-run`
- `--resume`
- `--skip-files`
- `--skip-database`
- `--skip-git-link`
- `--skip-git`
- `--keep-dump`
- `--yes` or `--non-interactive`

Git linking is read-only toward the remote: A-CLI may discover, fetch, and configure an upstream, but it never runs `git push`. `--skip-git` disables both initialization and remote linking; `--skip-git-link` keeps optional local initialization but disables origin discovery.

If Git authentication is selected through a local SSH config alias, configure it per profile with `acli profile git-alias <profile> <alias>`. Profile creation also accepts `--git-ssh-host-alias <alias>`.
