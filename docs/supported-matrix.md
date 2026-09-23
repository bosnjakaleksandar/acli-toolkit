# What's supported

A precise reference for what A-CLI can create and sync, and the known edges of that support — so "does this work?" has a definite answer instead of trial and error.

## Project types

| Type | Scaffolded by | Local environment |
|---|---|---|
| WordPress theme (`wp-theme`) | A-CLI (starter theme or a custom repo) | Docker or Lando |
| WordPress + WooCommerce (`wp-woo`) | A-CLI | Docker or Lando |
| WordPress + React (`wp-react`) | A-CLI | Docker or Lando |
| Existing WordPress site (`existing-wp`, via `acli import`) | Synced from a configured staging profile (see below) | Docker or Lando |
| React | [`create-vite`](https://vite.dev) (official) | none — its own dev server |
| Next.js | [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) (official) | none — its own dev server |
| Laravel + React/Next.js | `composer create-project laravel/laravel` (official) + the frontend generator above | none — `php artisan serve` + the frontend's own dev server |

React/Next.js/Laravel are deliberately **not** scaffolded by A-CLI's own templates — they're handed to the official generators so the result always reflects that ecosystem's current best practice, not a copy that can drift out of date. See [React](./react.md), [Next.js](./nextjs.md), [Laravel](./laravel.md).

`acli create` handles only the new-project rows. Existing WordPress sites always enter through the separate, profile-only `acli import` command.

## Local environments (WordPress only)

- **Docker Compose** — official `wordpress`/`mysql`/`phpmyadmin` images, unified credentials (`wordpress`/`wordpress`/`wordpress`), fixed DB host `db`.
- **Lando** — the `wordpress` recipe, matching credentials, DB host `database`.

Both adapters implement the same contract (`src/environments/EnvironmentService.ts`) and are held to real behavioral parity by `test/environment-adapter-contract.test.js` — a capability added to one and forgotten in the other fails that test.

## Remote providers (existing-WP sync)

### SSH with wp-cli (`provider: ssh`, default)

The server is reachable over SSH and has `wp` available. Files are synced with rsync; the database is exported with `wp db export`, and the table prefix and site URL are read directly (`wp config get table_prefix`, `wp option get siteurl`) instead of parsed from the dump. The `docker`/`direct` database drivers and the `sftp` transport were removed in 2.1.

### Coolify staging (`provider: coolify-cli`)

For servers that give developers only the `project` CLI instead of direct access to files and databases. A-CLI sends only the read-only `project list`, `status`, `db-export` and `wp-export` subcommands, downloads each export with `scp` and unpacks it locally; `remote` and `files` are not used. Pullable targets are `db`, `uploads`, `plugins`, `themes` and `languages`. The table prefix is detected from the dump, and Git linking uses the repository and deployed branch reported by `project status`. See [examples/config/coolify.yaml](https://github.com/bosnjakaleksandar/project-setup/blob/main/examples/config/coolify.yaml).

## How table prefix and site URL are determined

1. An explicit `database.tablePrefix` in the profile, if set, always wins.
2. Otherwise, with the ssh provider, the value reported by wp-cli on the server wins.
3. Otherwise, the dump is parsed: every `CREATE TABLE`/`DROP TABLE`/`INSERT INTO` statement is checked against WordPress's core table names (`options`, `posts`, `postmeta`, `users`, `usermeta`, `comments`, `commentmeta`, `links`), and the prefix covering the *most* of them wins — not simply the first match. This is deliberate: a plugin table like `wp_gdpr_cc_options` sorts alphabetically before the real `wp_options` in most dumps, and a first-match strategy would detect the plugin's prefix instead of the site's.
4. The site URL that gets search-replaced is read back from the freshly imported database itself (`wp option get siteurl`), not guessed from a naming convention — `urls.staging` in the profile is only ever an additional fallback source.

## Known limitations

- The remote dump's WordPress core version and the configured local Docker/Lando version are independent — a large version gap is the user's responsibility to manage. New configurations default to a pinned WordPress release for reproducibility; set `wpVersion: latest` explicitly to opt into a moving version.
- The Docker template's database host is fixed to the service name `db` (no custom host/port).
- Multisite dumps import, but URL replacement covers only the discovered `siteurl` plus any explicitly declared `urls.additionalSearchReplace` entries — it does not walk every subsite's URL automatically.
- File/database sync and Git integration are pull-only (remote → local). A-CLI may fetch and configure tracking, but its command runner rejects `git push` and `git send-pack`; publishing is always a manual user action.

## Reliability guarantees

- Database readiness is checked at the same path the application actually uses (TCP, app credentials, from the app container) — not just that the database process has started, which can report ready before the application can actually reach it.
- A stale local database (e.g. a Docker volume left over from before a credentials change) is detected and automatically recovered from once per run: the volume is rebuilt, `wp-config.php` is regenerated, and the import is retried.
- A failed import always preserves `staging.sql` and prints an exact resume command — it never reports success after a partial or failed migration. See [Existing WP](./existing-wp.md).
