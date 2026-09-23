# Configuration

A-CLI does not load `.env` files as CLI configuration. It reads YAML from two places; `acli config path` prints both, and `acli config init` writes a starter file.

- **User config** (platform location): your staging profiles and the default profile, plus defaults and presets for `acli create`. Profiles describe how *this machine* reaches a server, so this is the only place they are read from.
- **Project config** (`.acli/config.yaml`): the project link written by `acli import` / `acli link`, plus create defaults and presets for that project. It cannot declare profiles or a default profile, so a repository you cloned can't redirect `acli pull` to another server.

Precedence is built-in defaults, user configuration, project configuration, selected preset, `--set` overrides, then explicit CLI options. Every document starts with `version: 1`. Run `acli config validate` before a workflow and `acli config show` to see the merged result (secret-looking fields are redacted).

Values are used exactly as written. Since 2.1, A-CLI no longer resolves `${ENV_VAR}` or `{command: ...}` references, and validation names any that are left. Put machine-specific values such as `ssh.identityFile` directly into your user config, which isn't shared.

The process environment variables A-CLI does read (`ACLI_VERBOSE`, `ACLI_CONFIG_HOME`, `WP_THEME_REPO`, ...) are listed in [`.env.example`](https://github.com/bosnjakaleksandar/project-setup/blob/main/.env.example).
