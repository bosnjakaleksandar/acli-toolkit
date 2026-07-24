# Doctor

```bash
acli doctor
```

Doctor only checks what the selected workflow actually needs, so it never fails on a tool an unrelated project type doesn't use:

- **Always**: Node.js, npm, Git
- **If a local environment is selected** (`--environment`, a preset's `environment`, or your configured default): Docker Compose or Lando
- **If the preset uses Laravel** (`useLaravel: true`, e.g. the `laravel-react`/`laravel-next` presets): Composer, PHP
- **If a staging profile applies** (`--profile`, or a preset's `profile`): SSH, and rsync or SCP depending on the profile's `files.transport`

WP-CLI is never checked — it's optional locally; Docker/Lando workflows run `wp` commands inside the environment. `unzip` (used by `acli import --source zip`) isn't checked either.

Missing tools are reported with a suggested fix.

## Checking a specific workflow

Doctor mirrors `acli create`'s own resolution of preset/profile/environment, so pass the same options to check exactly what that run would need:

```bash
acli doctor --preset wordpress --environment docker
acli doctor --profile agency-staging
```

## Options

- `--preset <preset>`
- `--profile <profile>`
- `--environment <docker|lando>`
- `--config <path>`
- `--json` — machine-readable output; exits 1 if any checked tool is missing
