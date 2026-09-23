# Getting started

<AcliMascot state="idle" message="Hi! I'm the A-CLI Bot. I'll be with you in the terminal the whole way." />

A-CLI does two jobs:

| | What it does | Commands |
| --- | --- | --- |
| **New projects** | Scaffolds a React, Next.js, Laravel or WordPress project with everything wired up: local environment (WordPress), Git, formatting, next steps. | `acli create` |
| **Existing WordPress sites** | Copies a site from a staging server — files, database, Git — into a working local Docker or Lando setup, and keeps it up to date. Read-only towards the server. | `acli profile`, `acli import`, `acli pull`, `acli link` |

## Install

A-CLI needs **Node.js 22.18 or newer**.

```bash
npm install --global acli-toolkit
```

Or run it without installing:

```bash
npx acli-toolkit
```

Check it works:

```bash
acli --version
```

## What else you need

A-CLI checks these itself before it starts, and tells you what is missing and how to install it — you don't have to run a separate check.

| For | You need |
| --- | --- |
| Everything | Node.js 22.18+, npm, Git |
| WordPress projects (new or imported), or an application with a local environment | Docker with Compose v2, **or** Lando |
| Laravel projects | Composer and PHP 8.2+ |
| Importing from an SSH server | `ssh` and `rsync` locally; `wp` (wp-cli) on the server |
| Importing from a Coolify server | `ssh`, `scp` and `tar` locally |

WP-CLI is not needed on your machine: Docker and Lando environments run `wp` inside the container.

## First run

Run `acli` with no arguments to open the menu:

<AcliTerminal title="~ acli">
<AcliBanner compact />
<AcliMascot state="idle" message="Ready to build something awesome?" />
<pre>◆  What would you like to do?
│  ● Create a project
│  ○ Import an existing WordPress site
│  ○ Profiles
│  ○ Link an existing project to a staging profile
│  ○ Pull files/database from a linked profile
│  ○ Show command help</pre>
</AcliTerminal>

Every menu entry is also a command you can run directly, with options for scripts and CI.

## Commands at a glance

| Command | Use it to |
| --- | --- |
| `acli create` | Scaffold a new project. [Guide →](./create) |
| `acli profile create` | Save how to reach a staging server. [Guide →](./profiles) |
| `acli import [project]` | Bring a WordPress site from staging into a new local project. [Guide →](./import-and-pull) |
| `acli pull [targets...]` | Refresh the database and/or files of an imported project. [Guide →](./import-and-pull#pull-updates-later) |
| `acli link` | Connect a folder you already have (e.g. a cloned repo) to a profile. |
| `acli config` | See where configuration lives, validate it, print it. |
| `acli update` | Install the latest version. |

Global options on every command: `--verbose` (show the commands A-CLI runs), `--debug` (stack traces), `--quiet` (no banner or animations), `--skip-update` (skip the update check).

## Where to next

- Starting something new? → [Create a project](./create)
- Working on an existing WordPress site? → [Create a profile](./profiles) first, then [import it](./import-and-pull).

::: tip Updates
`acli` checks npm for a newer version at most once a day and offers to install it. `acli update` installs it right away; `acli update --check` only reports (exit code 1 when an update exists). Checks are skipped in CI, with `--yes`, and when output isn't a terminal.
:::
