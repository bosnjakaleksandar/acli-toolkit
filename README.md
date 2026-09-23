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

Node.js 22.18 or newer is required.

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
create-project --type application --framework react
# Warning: 'create-project' is deprecated. Use 'acli create' instead.
```

New scripts and documentation should use `acli`.

## Command Platform

Project generation is one A-CLI command rather than the entire application. Commands are registered independently, keeping future additions isolated from the root parser.

```bash
acli create
acli import
acli update
acli config
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

`acli create` and `acli import` check the tools they need before they start and, if something is missing or too old, say how to install it.

## Quick Start

```bash
acli create
```

The CLI asks what you want to create and any project-specific questions — including which local environment to use for WordPress projects (React/Next.js/Laravel are scaffolded by their own official generators and don't need one). It then scaffolds the project and prints next steps.

## Examples

```bash
acli create --type wordpress --wp-type theme
acli create --type wordpress --wp-type woo
acli create --type application --framework react
acli create --type application --framework nextjs
acli create --type application --framework react --laravel
acli create --type application --framework nextjs --laravel
```

## CLI Options

Interactive mode is still the default:

```bash
acli create
```

You can also pass partial options. The CLI skips prompts for supplied values and asks only for the missing choices:

```bash
acli create --name my-app
acli create --name my-app --type application --framework react
acli create --name salon --type wordpress --wp-type theme --environment lando
```

For non-interactive usage, pass `--yes` or `--non-interactive`. Missing required values are reported as errors instead of prompts:

```bash
acli import --name client-site --profile agency --environment lando --yes
acli create --type application --framework nextjs --laravel --name booking-app --yes
```

Values in `defaults` in your configuration (for example your starter theme repository) are used unless an option overrides them.

A few of the most common `create` options — see [docs/cli-options.md](docs/cli-options.md) for the full reference (every `create`/`import` flag, plus global options like `--verbose`, `--debug`, and `--skip-update`):

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--type <application|wordpress>`
- `--framework <react|nextjs|next>`
- `--laravel`
- `--wp-type <theme|woo|react|wp-theme|wp-woo|wp-react>`
- `--yes` or `--non-interactive`
- `--dry-run`
- `--resume`

## Generated Projects

React projects include a Vite app, ESLint, Prettier, `.editorconfig`, and `.env.example`.

Next.js projects include App Router, TypeScript, ESLint config dependencies, Prettier, `.editorconfig`, and `.env.example`.

Laravel combinations create a real Laravel application in `backend/` using `composer create-project`, plus a generated frontend in `frontend/`.

WordPress projects generate the selected Docker or Lando environment, support starter or custom theme repositories, optional branch selection, and optional plugin setup scripts.

`acli create` only scaffolds new projects. `acli import` is the separate existing-WordPress workflow: it uses a configured staging profile to sync files, export the database, scaffold the local environment, discover Git remotes, migrate the database, and link the project so `acli pull` can re-sync it afterward. A discovered Git origin is fetched and its default branch becomes the local upstream without overwriting imported files. Git integration is strictly pull-only: A-CLI never commits or pushes, and its command runner rejects push attempts. Create a profile first with `acli profile create`: it reaches the server either over SSH with wp-cli (rsync for files) or through a Coolify server's `project` CLI. Import uses `--profile`, then the default profile (`acli profile use`), then a sole profile, and otherwise asks. Use `acli link` to attach a profile to a directory you did not create with A-CLI. See [docs/existing-wp.md](docs/existing-wp.md) and [docs/supported-matrix.md](docs/supported-matrix.md).

Developers who use separate `~/.ssh/config` aliases for Git accounts can map one per profile, for example: `acli profile git-alias agency-staging github-work`.

Imported WordPress projects receive the bundled WordPress `.gitignore` rules. An existing remote `.gitignore` is preserved as the base, with only missing A-CLI rules added.

## Configuration

Staging servers live in profiles, which are read only from your user configuration. `defaults` holds values `acli create` should use without asking (for example a team's starter theme). YAML configuration is layered from built-in defaults, user configuration, then `.acli/config.yaml` (project link and create defaults), and command options override all of them.

```bash
acli config path
acli config validate
acli profile create
acli profile use agency
acli profile current
acli import --name client-site --profile agency --dry-run --yes
```

Documents require `version: 1`. A-CLI does not load repository `.env` files, and values are used as written (no `${ENV_VAR}` or command references). Example profiles for both providers ship in `examples/config`. See [docs/environment-variables.md](docs/environment-variables.md).

## Troubleshooting

Missing local tools are reported, with install hints, before a command changes anything. `--verbose` shows every command A-CLI runs.

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
