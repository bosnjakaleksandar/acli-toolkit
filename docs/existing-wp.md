# Existing WP

Existing WordPress setup syncs staging uploads, plugins, and themes, exports the database, detects table prefixes, links Git metadata when possible, imports locally, and runs URL search-replace.

Required environment variables:

```bash
STAGING_SSH_HOST=example.com
STAGING_SUFFIX=.staging
```
