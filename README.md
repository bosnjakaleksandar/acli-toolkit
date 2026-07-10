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
npx a-cli
```

Or install the command globally:

```bash
npm install --global a-cli
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

Project generation is one A-CLI command rather than the entire application. Commands are registered independently, keeping future additions such as `config`, `workspace`, `templates`, `deploy`, and `auth` isolated from the root parser.

```bash
acli create
acli doctor
acli update
```

## Updates

On normal interactive launches, `acli` checks npm for a newer published version. Registry results are cached in `~/.a-cli/update.json` for 24 hours. If npm is unavailable, startup continues without an error or delay beyond the five-second request timeout.

When an update is available, accept the prompt to install it globally, then rerun `acli`. To update immediately without a prompt:

```bash
acli update
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

The CLI asks what you want to create, which local environment to use, and any project-specific questions. It then scaffolds the project and prints next steps.

## Examples

```bash
acli create --preset wordpress
acli create --preset wordpress-woo
acli create --preset react
acli create --preset next
acli create --preset laravel-react
acli create --preset laravel-next
acli create --preset ./preset.json
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
acli create --name my-app --preset react --environment docker
acli create --name salon --preset wordpress --environment lando
```

For non-interactive usage, pass `--yes` or `--non-interactive`. Missing required values are reported as errors instead of prompts:

```bash
acli create --existing --name client-site --environment lando --yes
acli create --type application --framework nextjs --laravel --name booking-app --environment docker --yes
```

Presets and CLI options can be combined. CLI options override preset values, so this uses the React preset but creates a Lando environment:

```bash
acli create --preset react --name my-app --environment lando
```

Common options:

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--preset <preset>`
- `--existing`
- `--type <application|wordpress>`
- `--framework <react|nextjs|next>`
- `--laravel`
- `--wp-type <theme|woo|react|wp-theme|wp-woo|wp-react>`
- `--mysql <version>`
- `--wp-version <version>`
- `--theme-repo <url>`
- `--theme-branch <branch>`
- `--staging-url <url>`
- `--ssh-key <path>`
- `--skip-git`
- `--skip-knowledge-base`
- `--yes` or `--non-interactive`
- `--skip-update`

## Doctor

`acli doctor` verifies:

- Node.js
- npm
- Git
- Docker
- Docker Compose
- Lando
- Composer
- PHP
- SSH
- WP-CLI, optional

Missing tools are reported with suggested fixes.

## Presets

Presets skip questions that already have answers. Built-in presets are:

- `wordpress`
- `wordpress-woo`
- `react`
- `next`
- `laravel-react`
- `laravel-next`

Custom JSON preset example:

```json
{
  "projectName": "acme-site",
  "projectType": "wordpress",
  "environment": "lando",
  "mysqlVersion": "8.0",
  "wpVersion": "latest",
  "themeRepo": "git@github.com:company/theme.git",
  "themeBranch": "main",
  "plugins": ["advanced-custom-fields"]
}
```

Run it with:

```bash
acli create --preset ./preset.json
```

## Generated Projects

React projects include a Vite app, ESLint, Prettier, `.editorconfig`, and `.env.example`.

Next.js projects include App Router, TypeScript, ESLint config dependencies, Prettier, `.editorconfig`, and `.env.example`.

Laravel combinations create a real Laravel application in `backend/` using `composer create-project`, plus a generated frontend in `frontend/`.

WordPress projects generate the selected Docker or Lando environment, support starter or custom theme repositories, optional branch selection, and optional plugin setup scripts.

Existing WordPress projects sync staging files, export the staging database, scaffold the local environment, detect Git remotes, import the database, and run search-replace.

## Configuration

Environment variables can be placed in `.env` at the project root:

```bash
STAGING_SSH_HOST=example.com
STAGING_SUFFIX=.staging
WP_THEME_REPO=git@github.com:company/theme.git
WP_WOO_BRANCH=woocommerce
WP_REACT_BRANCH=react
KNOWLEDGE_BASE_URL=https://knowledge-base.staging
WP_BASIC_AUTH_USER=username
WP_BASIC_AUTH_PASS=password
```

## Troubleshooting

Run `acli doctor` first. It catches most missing local tools.

If a global update fails with a permissions error, configure an npm user-owned global directory (recommended by npm) or use `npx a-cli` instead. Check the installed copy with `acli --version` and the registry release with `npm view a-cli version`.

If an update check is stale or its cache is damaged, remove `~/.a-cli/update.json`; it will be recreated on the next successful check. Offline update checks fail silently by design and never prevent project creation.

If Laravel generation fails, install Composer and PHP, then rerun the command.

If a theme clone fails, verify the repository URL, selected branch, and SSH key access.

If existing WordPress sync fails, verify `STAGING_SSH_HOST`, SSH access, rsync availability, and the remote project directory.

If Docker database import fails, start the environment manually and inspect container logs:

```bash
docker compose logs
```

If Lando database import fails, verify the app started:

```bash
lando start
lando info
```
