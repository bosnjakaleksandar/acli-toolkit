# A-CLI

```text
 █████╗        ██████╗██╗     ██╗
██╔══██╗      ██╔════╝██║     ██║
███████║█████╗██║     ██║     ██║
██╔══██║╚════╝██║     ██║     ██║
██║  ██║      ╚██████╗███████╗██║
╚═╝  ╚═╝       ╚═════╝╚══════╝╚═╝   Developer Toolkit
```

A-CLI does two jobs:

- **Create projects** — React (Vite), Next.js, Laravel with React or Next.js, and WordPress themes (standard, WooCommerce, React), each with an optional Docker or Lando environment (WordPress always uses one).
- **Bring WordPress sites home** — import a site from a staging server (over SSH with wp-cli, or through a Coolify server's `project` CLI) into a working local Docker or Lando project, then keep it fresh with `acli pull`. Pull-only: A-CLI never changes the server.

📖 **Documentation: https://bosnjakaleksandar.github.io/acli-toolkit/**

## Install

Requires Node.js 22.18 or newer.

```bash
npm install --global acli-toolkit
acli
```

Or without installing: `npx acli-toolkit`.

## Quick start

```bash
# a new project
acli create

# an existing WordPress site: describe the server once, then import
acli profile create
acli import

# later, inside the project
acli pull db
```

Running `acli` with no arguments opens an interactive menu with the same actions.

| Guide | |
| --- | --- |
| [Getting started](https://bosnjakaleksandar.github.io/acli-toolkit/guide/getting-started) | What A-CLI does, requirements, first run |
| [Create a project](https://bosnjakaleksandar.github.io/acli-toolkit/guide/create) | Project types, questions, options |
| [Profiles](https://bosnjakaleksandar.github.io/acli-toolkit/guide/profiles) | Setting up a staging server, step by step |
| [Import & pull](https://bosnjakaleksandar.github.io/acli-toolkit/guide/import-and-pull) | What an import does, pulling updates, Coolify |
| [Commands](https://bosnjakaleksandar.github.io/acli-toolkit/reference/commands) · [Configuration](https://bosnjakaleksandar.github.io/acli-toolkit/reference/configuration) | Every option and setting |

## Development

```bash
npm install
npm test          # typecheck + tests
npm run build     # compile to dist/
npm link          # use this checkout as `acli`
npm run docs:dev  # documentation site
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). MIT licensed.
