# Migrating from the legacy `create-project` tool

Older versions of this tool (`create-project`, pre-A-CLI) connected to a single shared staging host using a fixed convention read from a repo-level `.env` file:

- `STAGING_SSH_HOST` — the one staging server every project lived on.
- `STAGING_SUFFIX` (default `.staging`) — every project's staging URL was `https://<project><STAGING_SUFFIX>`.
- SSH username was always the project name; the remote path was always `~/<project>/wordpress`.
- The remote database ran in Docker, discovered by a container name containing the project name.

A-CLI's [profiles](./presets.md) generalize this into declarative, portable configuration instead of environment variables and hardcoded conventions — but you don't have to hand-translate your old setup. `acli profile import-legacy` reproduces it exactly, in one command:

```bash
acli profile import-legacy agency-staging --host "$STAGING_SSH_HOST"
```

If `STAGING_SSH_HOST` (and optionally `STAGING_SUFFIX`) are already set in your shell environment — as they would have been for the legacy tool — you can omit `--host`/`--suffix` entirely and they'll be read automatically:

```bash
acli profile import-legacy agency-staging
```

This produces a profile with:

- SSH username templated as `{projectName}` and remote path `{projectName}/wordpress`, matching the legacy convention exactly.
- The `docker` database driver with container-name discovery, matching the legacy remote dump script.
- A staging URL of `https://{projectName}<suffix>`.
- `hostKeyPolicy: insecure`, matching the legacy tool's `StrictHostKeyChecking=no` behavior *exactly* — deliberately, so the migrated profile connects on the first try with zero behavior change. Once you've verified it works, tighten this to `accept-new` or `strict` (edit the saved profile, or rerun `acli profile create --host ... --host-key-policy accept-new` to rebuild it from scratch).

From there, use the imported profile the same as any other:

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
