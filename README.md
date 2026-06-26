# project-setup

`project-setup` is a Node.js CLI for scaffolding local projects used across modern frontend, Laravel, and WordPress workflows.

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

```bash
npm install
npm link
```

After linking, run:

```bash
create-project
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
create-project doctor
```

## Quick Start

```bash
create-project
```

The CLI asks what you want to create, which local environment to use, and any project-specific questions. It then scaffolds the project and prints next steps.

## Examples

```bash
create-project --preset wordpress
create-project --preset wordpress-woo
create-project --preset react
create-project --preset next
create-project --preset laravel-react
create-project --preset laravel-next
create-project --preset ./preset.json
create-project doctor
```

## Doctor

`create-project doctor` verifies:

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
create-project --preset ./preset.json
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

Run `create-project doctor` first. It catches most missing local tools.

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
