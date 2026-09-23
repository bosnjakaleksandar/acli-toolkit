# Create a project

<AcliMascot state="working" message="Tell me what you're building — I'll set up the rest." />

`acli create` scaffolds a new project and leaves it ready to run: dependencies, formatting, a Git repository and, if you want one, a local Docker or Lando environment.

## What you can create

| Type | What you get |
| --- | --- |
| **React** | A Vite app with ESLint, Prettier, `.editorconfig` and `.env.example`. |
| **Next.js** | App Router + TypeScript, ESLint, Prettier, `.editorconfig` and `.env.example`. |
| **Laravel + React / Next.js** | A real Laravel app in `backend/` (via `composer create-project`) and the frontend in `frontend/`. |
| **WordPress theme** | WordPress in Docker or Lando, with your starter theme or a custom theme repository. |
| **WordPress + WooCommerce** | The same, with WooCommerce. |
| **WordPress + React** | The same, set up for a React-based theme. |

React, Next.js and Laravel are generated with their official tools (`create-vite`, `create-next-app`, `composer`).

## Local environment

Every type can get a local environment. Applications can also run natively — the default — with their own dev servers (`npm run dev`, `php artisan serve`).

| Type | Docker (`docker-compose.yaml`) / Lando (`.lando.yml`) |
| --- | --- |
| **React** | A Node 22 container running the Vite dev server — `localhost:5173` (Docker) or `http://<name>.lndo.site` (Lando). |
| **Next.js** | A Node 22 container running `next dev` — `localhost:3000` (Docker) or `http://<name>.lndo.site` (Lando). |
| **Laravel + React / Next.js** | PHP 8.3 with Composer serving `backend/` (migrations run on start), MySQL, and a Node container for `frontend/`. Docker: backend on `localhost:8000`, frontend on 5173 or 3000. Lando: the `laravel` recipe, with `lando artisan`, `lando composer` and `lando npm`. |
| **WordPress** | WordPress, MySQL/MariaDB and, optionally, WP-CLI. WordPress always needs Docker or Lando. |

Dependencies are installed inside the containers, and ports are bound to `127.0.0.1` only. Start it with `docker compose up` or `lando start`.

Every project gets a `.gitignore` with its framework's rules (build output, `vendor/`, WordPress core and uploads, …) plus the ones all projects share: dependencies, `.env` files (keeping `.env.example`), logs, editor and OS files, and `.acli/`. A-CLI's `.gitignore` always takes precedence: for React and Next.js it replaces the generator's file, and any rules only the generator had are kept at the end.

## Step by step

Run:

```bash
acli create
```

A-CLI asks only what it needs for the type you pick:

<ol class="step-list">
<li><strong>What is the name of your project?</strong> — also the folder name. Lowercase letters, numbers, <code>-</code> and <code>_</code>.</li>
<li><strong>Application or WordPress?</strong></li>
<li><strong>Application:</strong> React or Next.js, then whether to add Laravel as a backend.<br><strong>WordPress:</strong> Standard theme, WordPress + WooCommerce, or WordPress + React.</li>
<li><strong>Local environment:</strong> <strong>Docker</strong> or <strong>Lando</strong> — or, for applications, <strong>None</strong> (the default) to run it natively.</li>
<li><strong>Customize advanced settings?</strong> (WordPress) — only if you want other MySQL/MariaDB or WordPress versions than the defaults (MySQL 8.0 and a pinned WordPress release).</li>
<li><strong>WordPress theme:</strong> your team's starter theme (when configured), a custom theme repository (HTTPS or SSH), or minimal theme files. Then an optional branch, optional plugins, and whether to install WP-CLI in the environment.</li>
<li><strong>Project plan</strong> — a summary of every answer. Choose <em>Create project</em>, <em>Change answers</em> (edit any of them) or <em>Cancel</em>. Nothing is written before this point.</li>
</ol>

When it finishes, A-CLI prints the project's location and the next commands to run.

## Without questions

Every answer has an option, so you can skip the questions you already know — or all of them with `--yes`:

```bash
acli create --name my-app --type application --framework react
acli create --name booking --type application --framework nextjs --laravel --yes
acli create --name dashboard --type application --framework react --environment docker --yes
acli create --name shop --type wordpress --wp-type woo --environment docker --yes
acli create --name site --type wordpress --wp-type theme \
  --theme-repo git@github.com:your-org/starter-theme.git --theme-branch main
```

With `--yes`, a missing required answer is an error instead of a question. See all options in the [command reference](../reference/commands#acli-create).

## Team defaults

Values your team always uses can go in `defaults` in your [configuration](../reference/configuration) — A-CLI uses them without asking, and command options still win:

```yaml
version: 1
defaults:
  environment: docker
  themeRepo: git@github.com:your-org/starter-theme.git
  plugins: [advanced-custom-fields]
```

For the WordPress starter theme you can also set the environment variables `WP_THEME_REPO`, `WP_WOO_BRANCH` and `WP_REACT_BRANCH`.

## Preview and recover

- `--dry-run` prints the plan and changes nothing.
- If creation fails half-way, the folder is kept and A-CLI prints the exact command to continue, e.g. `acli create --resume --name my-app`. Finished steps are not repeated.
