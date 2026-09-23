# Import & pull WordPress

<AcliMascot state="working" message="Point me at a site on staging and I'll bring it home — files, database, Git and all." />

`acli import` turns a WordPress site on a staging server into a working local project. `acli pull` keeps it up to date afterwards. Both need a [profile](./profiles) for the server.

## Import a site

```bash
acli import
```

(or **Import an existing WordPress site** in the `acli` menu)

<ol class="step-list">
<li>

**Profile** — A-CLI uses `--profile`, else your default profile, else your only profile; otherwise it asks.

</li>
<li>

**Project** — with a Coolify profile, A-CLI lists the projects the server gives you and you pick one. You can also name it directly: `acli import "Client Site"`. With an SSH profile, the project is the local name you enter next.

</li>
<li>

**Local project directory/name** — the folder to create, e.g. `client-site`. It is suggested from the server project ("Client Site" → `client-site`).

</li>
<li>

**Local environment** — Docker (`docker-compose.yaml`) or Lando (`.lando.yml`).

</li>
<li>

**Summary** — the server, user and project that will be used. Then A-CLI works through the steps below.

</li>
</ol>

<AcliTerminal title="acli import">
<pre>◇  Which project do you want to import?
│  Client Site
│
◇  Local project directory/name:
│  client-site
│
◇  Which local environment do you prefer?
│  Docker (docker-compose.yaml)
│
◇  Selected profile: coolify ──────────────────────────────────────────────╮
│  Remote: developer@cloud.example.com                                      │
│  Database and files: exported with the server's project CLI (pull-only)   │
│  Local: docker                                                            │
│  Server project: Client Site                                              │
├───────────────────────────────────────────────────────────────────────────╯
◒  2/3 Importing files and database...</pre>
</AcliTerminal>

### What happens

| Step | What A-CLI does |
| --- | --- |
| Validating requirements | Checks your local tools and that the server and project are reachable. Nothing is created until this passes. |
| Fetching WordPress files | Copies `wp-content` (uploads, plugins, themes, and languages on Coolify). |
| Fetching database dump | Exports the database on the server and downloads it as `staging.sql`. |
| Detecting table prefix | Reads it from the server (SSH/wp-cli) or from the dump, so the local site uses the right tables. |
| Scaffolding local environment | Writes `docker-compose.yaml` or `.lando.yml` for this site. |
| Linking project to its profile | Saves the link in `.acli/config.yaml`, so `acli pull` needs no arguments later. |
| Linking Git repository | Connects the site's Git origin, pull-only ([details](#git)). |
| Preparing Git ignore rules | Adds WordPress rules to `.gitignore`, keeping the repository's own. |
| Importing database and replacing URLs | Starts the environment, imports the dump, and replaces the staging URLs with your local one. |

At the end A-CLI installs dependencies where it can and prints the local URL and next steps. The dump contains real user data, so `staging.sql` is deleted after a successful import (`--keep-dump` keeps it).

### If it stops half-way

Nothing that was already downloaded is deleted. A-CLI prints the exact command to continue from the step that failed, e.g.:

```bash
acli import "Client Site" --resume --name client-site
```

Finished steps — like a 1 GB `uploads` download — are not repeated.

### Useful options

| Option | Effect |
| --- | --- |
| `--dry-run` | Show what would happen (server, project, transfers, tools) and change nothing. |
| `--skip-files` / `--skip-database` | Leave out files or the database. |
| `--skip-git-link` / `--skip-git` | Don't connect to the Git origin / don't create a Git repository at all. |
| `--remote-url <url>` | One more URL to replace, e.g. the live site's. |
| `--yes` | No questions; everything must come from options. |

All options: [command reference](../reference/commands#acli-import).

## What the project folder contains

```text
client-site/
├── .acli/config.yaml     ← link to the profile (and the server project)
├── docker-compose.yaml   ← or .lando.yml
├── wp-content/           ← uploads, plugins, themes, languages
└── .gitignore
```

The link looks like this — you normally never edit it:

```yaml
version: 1
project:
  name: client-site
  environment: docker
  profile: coolify
  remoteProject: Client Site          # only when it differs from the name
  selections:
    database: gk6zccy4rbmh5dlbruv9ypnj # answers to server questions, see below
```

## Pull updates later

Inside an imported project (any subfolder works):

```bash
acli pull db                 # just the database
acli pull uploads plugins    # just some folders
acli pull full --yes         # everything, no questions
acli pull                    # choose from a list
```

Targets are `db` plus the profile's folders: `uploads`, `plugins`, `themes` (and `languages` on Coolify, or your own on SSH profiles). Pulling `db` replaces your local database, so A-CLI asks first unless you pass `--yes`. `--dry-run` shows what would be pulled.

## Link a folder you already have

Cloned the repository yourself? Connect it to a profile so `acli pull` works there:

```bash
cd client-site
acli link --profile coolify --environment docker
acli link --remote-project "Client Site"   # when the server name differs
```

`acli link` offers to generate the Docker/Lando file if there isn't one. `--force` relinks a folder that is already linked.

## Coolify servers

A Coolify server exposes a `project` command instead of direct access to files and databases. A-CLI runs only its read-only subcommands over SSH:

| A-CLI needs | Server command |
| --- | --- |
| your projects | `project list` |
| project status, Git repo and branch | `project status <project>` |
| the database | `project db-export <project> sql.gz` |
| a folder | `project wp-export <project> uploads` (plugins, themes, languages) |

Each export is downloaded with `scp`, checked, unpacked and deleted locally.

**When the server asks a question** — some projects have more than one database container or WordPress container, and the server asks which one to use. A-CLI shows you the same question, sends your answer, and remembers it in `.acli/config.yaml`, so you are asked only once per project. With `--yes` it can't ask, so it stops and lists the choices. Pick the one WordPress uses — check `DB_HOST` in the site's `wp-config.php` or the project in Coolify.

**Exports stay on the server** in its backup folder; developers can't delete them. Ask your server administrator how long they are kept.

## Git

When Git linking is on, the imported project gets a Git repository whose `origin` is the site's repository, and its baseline is the branch that is actually deployed (on Coolify) or the repository's default branch. Imported files are **not** overwritten — you immediately see how staging differs from the repository.

A-CLI never commits or pushes. If fetching fails with *Permission denied (publickey)*, set your [Git SSH alias](./profiles#git-accounts-and-ssh-aliases) and resume.

## How the database comes out right

- **URLs:** the site's own URL is read from the imported database and replaced with your local URL, plus the profile's staging URL, `--remote-url` and `urls.additionalSearchReplace` — both `http://` and `https://`.
- **Table prefix:** read from the server where possible, otherwise from the dump by matching WordPress's core tables. Set `database.tablePrefix` in the profile if it can't be detected.
- **Portable dumps:** `CREATE DATABASE`/`USE` lines and MariaDB's sandbox marker are removed, and newer collations are rewritten for the local MySQL/MariaDB (`database.normalizeCollations: false` turns that off).
- **Ready before import:** A-CLI waits until WordPress can actually reach its database, and repairs a stale local database volume once if needed.

## Pull-only guarantees

A-CLI changes nothing on the server, and this is enforced in its code rather than by convention:

- Every command goes through one runner that refuses `git push` / `git send-pack`, and any SSH command that would run `project wp-import`, `db-import`, `db-backup`, `branch`, `deploy`, `shell`, `logs` or an admin subcommand.
- The Coolify provider additionally sends only `list`, `info`, `status`, `db-export` and `wp-export`.
- Downloaded archives are checked before unpacking: no absolute paths, no `..`, no links, nothing outside the expected folder.
- Profiles are read only from your own user configuration — a repository can't point your pull at another server.
