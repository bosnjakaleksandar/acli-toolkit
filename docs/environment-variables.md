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

## Trusting a project configuration

`.acli/config.yaml` is auto-discovered from the current directory — which may be a repository you just cloned, not one you wrote yourself. If that file declares a `command`/`${ENV_VAR}` reference inside `profiles`/`project.profile`, A-CLI will only resolve it if the file is **trusted**:

- Any `.acli/config.yaml` A-CLI itself wrote (`acli profile create`, `acli link`, `acli config init`, ...) is trusted automatically.
- A config that just appeared in your working directory is not. Review it, then run `acli config trust` to approve its current contents — editing the file afterward revokes trust until you re-approve it.
- For a one-off run (e.g. in a script), set `ACLI_TRUST_PROJECT_CONFIG=1` instead of trusting the file permanently.

See [SECURITY.md](https://github.com/bosnjakaleksandar/project-setup/blob/main/SECURITY.md#trust-model--please-read-before-running-a-cli-in-a-repository-you-dont-control) for the reasoning behind this.
