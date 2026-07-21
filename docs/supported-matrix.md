# What's supported

A precise reference for what A-CLI can create and sync, and the known edges of that support — so "does this work?" has a definite answer instead of trial and error.

## Project types

| Type | Scaffolded by | Local environment |
|---|---|---|
| WordPress theme (`wp-theme`) | A-CLI (starter theme or a custom repo) | Docker or Lando |
| WordPress + WooCommerce (`wp-woo`) | A-CLI | Docker or Lando |
| WordPress + React (`wp-react`) | A-CLI | Docker or Lando |
| Existing WordPress site (`existing-wp`) | Synced from a staging profile (see below) | Docker or Lando |
| React | [`create-vite`](https://vite.dev) (official) | none — its own dev server |
| Next.js | [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) (official) | none — its own dev server |
| Laravel + React/Next.js | `composer create-project laravel/laravel` (official) + the frontend generator above | none — `php artisan serve` + the frontend's own dev server |

React/Next.js/Laravel are deliberately **not** scaffolded by A-CLI's own templates — they're handed to the official generators so the result always reflects that ecosystem's current best practice, not a copy that can drift out of date. See [React](./react.md), [Next.js](./nextjs.md), [Laravel](./laravel.md).

## Local environments (WordPress only)

- **Docker Compose** — official `wordpress`/`mysql`/`phpmyadmin` images, unified credentials (`wordpress`/`wordpress`/`wordpress`), fixed DB host `db`.
- **Lando** — the `wordpress` recipe, matching credentials, DB host `database`.

Both adapters implement the same contract (`src/services/EnvironmentService.js`) and are held to real behavioral parity by `test/environment-adapter-contract.test.js` — a capability added to one and forgotten in the other fails that test.

## Remote database drivers (existing-WP sync)

- **`wp-cli`** (recommended) — the remote host has `wp` available; table prefix and site URL are read directly and authoritatively (`wp config get table_prefix`, `wp option get siteurl`) instead of parsed from the dump.
- **`docker`** — the remote database runs in a Docker container, discovered by name or by an explicit compose service.
- **`direct`** — a directly reachable MySQL/MariaDB host (e.g. a managed database service).

## File transports

`rsync` (default) or `sftp`/`scp`.

## How table prefix and site URL are determined

1. An explicit `database.tablePrefix` in the profile, if set, always wins.
2. Otherwise, with the `wp-cli` driver, the remote value wins.
3. Otherwise, the dump is parsed: every `CREATE TABLE`/`DROP TABLE`/`INSERT INTO` statement is checked against WordPress's core table names (`options`, `posts`, `postmeta`, `users`, `usermeta`, `comments`, `commentmeta`, `links`), and the prefix covering the *most* of them wins — not simply the first match. This is deliberate: a plugin table like `wp_gdpr_cc_options` sorts alphabetically before the real `wp_options` in most dumps, and a first-match strategy would detect the plugin's prefix instead of the site's.
4. The site URL that gets search-replaced is read back from the freshly imported database itself (`wp option get siteurl`), not guessed from a naming convention — `urls.staging` in the profile is only ever an additional fallback source.

## Known limitations

- The remote dump's WordPress core version and the local Docker/Lando image's version (`latest` by default) are independent — a large version gap is the user's responsibility to manage.
- The Docker template's database host is fixed to the service name `db` (no custom host/port).
- Multisite dumps import, but URL replacement covers only the discovered `siteurl` plus any explicitly declared `urls.additionalSearchReplace` entries — it does not walk every subsite's URL automatically.
- Sync is pull-only (remote → local). There is no push (local → remote) in this version.

## Reliability guarantees

- Database readiness is checked at the same path the application actually uses (TCP, app credentials, from the app container) — not just that the database process has started, which can report ready before the application can actually reach it.
- A stale local database (e.g. a Docker volume left over from before a credentials change) is detected and automatically recovered from once per run: the volume is rebuilt, `wp-config.php` is regenerated, and the import is retried.
- A failed import always preserves `staging.sql` and prints an exact resume command — it never reports success after a partial or failed migration. See [Existing WP](./existing-wp.md).
