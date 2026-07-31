# A-CLI

A-CLI is a Node.js CLI for scaffolding local projects used across modern frontend, Laravel, and WordPress workflows.

It supports:

- Next.js
- React with Vite
- Laravel + React
- Laravel + Next.js
- WordPress
- WordPress + WooCommerce
- WordPress + React
- Existing WordPress projects synced from staging

## Installation

Node.js 20 or newer is required.

Run without installing:

```bash
npx acli-toolkit
```

Or install the command globally:

```bash
npm install --global acli-toolkit
acli create
```

For local development of this repository:

```bash
npm install
npm link
```

After linking, run:

```bash
acli create
```

### Previous command name

`create-project` remains available temporarily as a compatibility alias. It prints a deprecation warning and forwards legacy project-generation options to `acli create`:

```bash
create-project --preset react
# Warning: 'create-project' is deprecated. Use 'acli create' instead.
```

New scripts and documentation should use `acli`.

## Command Platform

Project generation is one A-CLI command rather than the entire application. Commands are registered independently, keeping future additions isolated from the root parser.

```bash
acli create
acli import
acli doctor
acli update
acli config
acli preset
acli profile
acli link
acli pull
```

## Updates

On normal interactive launches, `acli` checks npm for a newer published version. Registry results are cached alongside your user configuration file (`update.json` next to the path shown by `acli config path`) for 24 hours. If npm is unavailable, startup continues without an error or delay beyond the five-second request timeout.

When an update is available, accept the prompt to install it globally, then rerun `acli`. To update immediately without a prompt:

```bash
acli update
```

To check whether an update is available without installing it — e.g. in a script, exits 1 if one is available:

```bash
acli update --check
```

To bypass the automatic check for a single run:

```bash
acli --skip-update
```

This is useful in CI and other automated environments. Update prompts are also automatically suppressed when input or output is not an interactive terminal.

## Version and Help

Print only the installed semantic version:

```bash
acli --version
acli -v
```

List commands and options:

```bash
acli --help
```

Global flags available on every command: `--verbose` (show commands and detailed progress), `--debug` (show stack traces on failure), `--quiet` (suppress decorative output).

## Requirements

Required tools depend on the project type:

- Node.js and npm for the CLI, React, and Next.js projects
- Git for repository initialization and theme cloning
- Docker with Docker Compose or Lando for local environments
- Composer and PHP for Laravel projects
- SSH and rsync for existing WordPress staging syncs
- WP-CLI is optional locally; Docker/Lando workflows can run WP commands inside the environment

Check your machine with:

```bash
acli doctor
```

## Quick Start

```bash
acli create
```

The CLI asks what you want to create and any project-specific questions — including which local environment to use for WordPress projects (React/Next.js/Laravel are scaffolded by their own official generators and don't need one). It then scaffolds the project and prints next steps.

## Examples

```bash
acli create --preset wordpress
acli create --preset wordpress-woo
acli create --preset react
acli create --preset next
acli create --preset laravel-react
acli create --preset laravel-next
acli create --preset ./preset.yaml
acli doctor
```

## CLI Options

Interactive mode is still the default:

```bash
acli create
```

You can also pass partial options. The CLI skips prompts for supplied values and asks only for the missing choices:

```bash
acli create --name my-app
acli create --name my-app --preset react
acli create --name salon --preset wordpress --environment lando
```

For non-interactive usage, pass `--yes` or `--non-interactive`. Missing required values are reported as errors instead of prompts:

```bash
acli import --name client-site --profile agency --environment lando --yes
acli create --type application --framework nextjs --laravel --name booking-app --yes
```

Presets and CLI options can be combined. CLI options override preset values, so this uses the WordPress preset but creates a Lando environment:

```bash
acli create --preset wordpress --name my-site --environment lando
```

A few of the most common `create` options — see [docs/cli-options.md](docs/cli-options.md) for the full reference (every `create`/`import` flag, plus global options like `--verbose`, `--debug`, and `--skip-update`):

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--preset <preset>`
- `--type <application|wordpress>`
- `--framework <react|nextjs|next>`
- `--laravel`
- `--wp-type <theme|woo|react|wp-theme|wp-woo|wp-react>`
- `--yes` or `--non-interactive`
- `--dry-run`
- `--resume`

## Doctor

`acli doctor` only checks what the selected workflow needs: Node.js/npm/Git always; Docker Compose or Lando if a local environment is selected; Composer/PHP for Laravel presets; SSH plus rsync or SCP if a staging profile applies. Pass `--preset`/`--profile`/`--environment` to check exactly what a specific `acli create`/`acli import` run would need. WP-CLI is never checked — it's optional locally; Docker/Lando workflows run `wp` inside the environment.

Missing tools are reported with suggested fixes. See [docs/doctor.md](docs/doctor.md) for the full breakdown.

## Presets

Presets skip questions that already have answers. Built-in presets are:

- `wordpress`
- `wordpress-woo`
- `react`
- `next`
- `laravel-react`
- `laravel-next`

Custom YAML preset example:

```yaml
projectName: acme-site
projectType: wordpress
environment: lando
mysqlVersion: "8.0"
wpVersion: latest
themeRepo: https://github.com/example/starter-theme.git
themeBranch: main
plugins: [advanced-custom-fields]
```

Run it with:

```bash
acli create --preset ./preset.yaml
```

## Generated Projects

React projects include a Vite app, ESLint, Prettier, `.editorconfig`, and `.env.example`.

Next.js projects include App Router, TypeScript, ESLint config dependencies, Prettier, `.editorconfig`, and `.env.example`.

Laravel combinations create a real Laravel application in `backend/` using `composer create-project`, plus a generated frontend in `frontend/`.

WordPress projects generate the selected Docker or Lando environment, support starter or custom theme repositories, optional branch selection, and optional plugin setup scripts.

`acli create` only scaffolds new projects. `acli import` is the separate existing-WordPress workflow: it uses a configured staging profile to sync files, export the database, scaffold the local environment, discover Git remotes, migrate the database, and link the project so `acli pull` can re-sync it afterward. A discovered Git origin is fetched and its default branch becomes the local upstream without overwriting imported files. Git integration is strictly pull-only: A-CLI never commits or pushes, and its command runner rejects push attempts. Create a profile first with `acli profile create`; with one configured profile import selects it automatically, while multiple profiles are presented for selection. Use `acli link` to attach a profile to a directory you did not create with A-CLI. See [docs/existing-wp.md](docs/existing-wp.md) and [docs/supported-matrix.md](docs/supported-matrix.md).

Developers who use separate `~/.ssh/config` aliases for Git accounts can map one per profile, for example: `acli profile git-alias agency-staging github-work --scope user`.

Imported WordPress projects receive the bundled WordPress `.gitignore` rules. An existing remote `.gitignore` is preserved as the base, with only missing A-CLI rules added.

## A-CLI v2 configuration

A-CLI is environment-agnostic. Project recipes live in presets; remote WordPress infrastructure lives in declarative profiles. YAML configuration is layered from built-in defaults, user configuration, `.acli/config.yaml`, selected presets, `--set`, and CLI options.

```bash
acli config path
acli config validate
acli preset list
acli profile create
acli profile use agency
acli profile current
acli import --name client-site --profile agency --dry-run --yes
```

Documents require `version: 1`. A-CLI does not load repository `.env` files. Profiles may explicitly reference environment variables or command-based secret providers; resolved output redacts secrets. Generic profiles ship in `examples/config`.

## Troubleshooting

Run `acli doctor` first. It catches most missing local tools.

If a global update fails with a permissions error, configure an npm user-owned global directory (recommended by npm) or use `npx acli-toolkit` instead. Check the installed copy with `acli --version` and the registry release with `npm view acli-toolkit version`.

If an update check is stale or its cache is damaged, remove `update.json` from the directory printed by `acli config path` (User); it will be recreated on the next successful check. Offline update checks fail silently by design and never prevent project creation.

If Laravel generation fails, install Composer and PHP, then rerun the command.

If a theme clone fails, verify the repository URL, selected branch, and SSH key access.

If an existing WordPress sync fails, run a dry run and verify the selected profile, SSH access, transfer tool, and remote WordPress path. A failed import never deletes what it already fetched — it prints an exact `--resume` command to continue from the step that failed instead of starting over.

If Docker database import fails, start the environment manually and inspect container logs:

```bash
docker compose logs
```

If Lando database import fails, verify the app started:

```bash
lando start
lando info
```
