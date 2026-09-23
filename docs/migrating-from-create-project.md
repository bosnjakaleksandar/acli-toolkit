# Migrating from the legacy `create-project` tool

Older versions of this tool (`create-project`, pre-A-CLI) connected to a single shared staging host using a fixed convention read from a repo-level `.env` file:

- `STAGING_SSH_HOST` — the one staging server every project lived on.
- `STAGING_SUFFIX` (default `.staging`) — every project's staging URL was `https://<project><STAGING_SUFFIX>`.
- SSH username was always the project name; the remote path was always `~/<project>/wordpress`.
- The remote database ran in Docker, discovered by a container name containing the project name.

A-CLI's [profiles](./profiles.md) replace these environment variables with declarative configuration. The Docker-container database convention itself is no longer supported (A-CLI 2.1 removed `profile import-legacy` and the `docker` database driver): the ssh provider exports the database with `wp db export` on the server.

If your legacy staging server has wp-cli, create an ssh profile that mirrors the old layout:

```bash
acli profile create agency-staging --provider ssh \
  --host "$STAGING_SSH_HOST" --username '{projectName}' \
  --project-root '{projectName}' --wordpress-root wordpress \
  --staging-url 'https://{projectName}.staging' --host-key-policy accept-new
```

If it doesn't, keep using A-CLI 2.0 for that server, or move the site to a server A-CLI supports.

From there, use the profile the same as any other:

```bash
acli import --name client-site --profile agency-staging
# or, for an already-checked-out project:
acli link --profile agency-staging --environment docker
acli pull
```

## What else changed

- The old `create-project` binary still works — it prints a deprecation warning and forwards to `acli create`. There's no forced cutover.
- The proprietary "Knowledge Base" registration step (`WP_BASIC_AUTH_USER`/`KNOWLEDGE_BASE_URL`) has been removed; it was specific to one organization's internal tooling and had no general equivalent.
- WordPress project creation and sync ("existing WordPress" workflow) is otherwise the same shape — see [existing-wp.md](./existing-wp.md) for what's new (authoritative table-prefix/site-URL detection instead of guessing, and the `acli link`/`acli pull` daily-use commands).
