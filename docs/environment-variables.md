# Configuration and secrets

A-CLI v2 does not load `.env` files as CLI configuration. It discovers YAML from the platform user location and `.acli/config.yaml` in the current project. Use `acli config path` to print both locations, or `acli config init` to write a starter file with an explanatory header.

Precedence is built-in defaults, user configuration, project configuration, selected preset, `--set` overrides, then explicit CLI options. Every document starts with `version: 1`.

Reference secrets without storing them:

```yaml
identityFile: "${ACLI_SSH_KEY}"
password:
  command: op read op://wordpress/staging/password
```

Command references execute without a shell. `acli config show --resolved` redacts secret values. Use `acli config validate` before running a workflow.
