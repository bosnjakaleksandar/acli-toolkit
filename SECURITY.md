# Security Policy

## Supported versions

Only the latest published version of `acli-toolkit` on npm receives security fixes. There is no long-term-support branch — please upgrade (`npm install -g acli-toolkit@latest`) before reporting an issue to confirm it still reproduces.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security report.

Instead, use one of:

- [GitHub Security Advisories](https://github.com/bosnjakaleksandar/project-setup/security/advisories/new) for this repository (preferred — keeps the report private until a fix ships), or
- Email **bosnjakaleksandar02@gmail.com** with a description of the issue, steps to reproduce, and its potential impact.

This is a solo-maintained project. Please allow a few days for an initial response. Once a fix is available, it will be released and the advisory (if one was filed) will be published with credit to the reporter, unless you ask to remain anonymous.

## Trust model — please read before running A-CLI in a repository you don't control

A-CLI reads project-scoped configuration (`.acli/config.yaml`) from the current working directory, similar to how tools like `direnv` read `.envrc` or `make` reads a `Makefile`. That file can declare secret references such as:

```yaml
password: { command: "op read op://vault/item/password" }
```

A-CLI **executes** the command in a `{ command: ... }` reference to resolve the secret. This is intentional and documented (see [docs/environment-variables.md](docs/environment-variables.md)) — but it means a `.acli/config.yaml` you didn't write yourself is, functionally, executable code, the same way a `Makefile` or `package.json` `scripts` block is.

To reduce the risk of this running unexpectedly (e.g. right after `git clone`-ing an unfamiliar repository), A-CLI content-hash-pins trust for project-scoped configs:

- A config file A-CLI itself wrote (via `acli profile create`, `acli link`, `acli config init`, etc.) is trusted automatically.
- A project config that merely *appears* in the working directory — for example because you just cloned a repository — is **not** trusted automatically. If it declares a secret command or `${ENV_VAR}` reference inside `profiles`/`project.profile`, A-CLI refuses to resolve it and tells you to run `acli config trust` once you've reviewed the file, or to set `ACLI_TRUST_PROJECT_CONFIG=1` for a single run.
- Editing a trusted file changes its content hash and revokes trust until you re-approve it.

**Practical guidance:** review `.acli/config.yaml` the same way you'd review a `Makefile` or an install script before running A-CLI commands inside a repository you don't already trust.

## Scope

This policy covers the `acli-toolkit` CLI itself (this repository). It does not cover:

- Vulnerabilities in projects A-CLI scaffolds (WordPress core, Laravel, npm packages pulled in by `create-vite`/`create-next-app`/`composer create-project`, etc.) — report those upstream.
- Misconfiguration of infrastructure you point A-CLI at (weak SSH keys, exposed staging servers, etc.).
