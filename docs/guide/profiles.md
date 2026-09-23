# Profiles

<AcliMascot state="thinking" message="A profile tells me how to reach a staging server. Set it up once — then every project on that server is one command away." />

A **profile** describes a staging **server**, not a project: its address, your SSH user and key, and how A-CLI gets files and the database from it. One profile serves every project on that server. Which project you want is chosen later, when you [import](./import-and-pull).

You need a profile before you can `acli import`, `acli pull` or `acli link`. You don't need one for `acli create`.

## Two kinds of servers

When you create a profile, A-CLI first asks how it reaches the server. Pick the one that matches yours:

| | **SSH with wp-cli** (`ssh`) | **Coolify project CLI** (`coolify-cli`) |
| --- | --- | --- |
| Use it when | you can SSH to the server and the WordPress files are there | the server runs sites in Coolify and gives developers the `project` command |
| Files | copied with `rsync` from the WordPress folder | exported by `project wp-export`, downloaded with `scp` |
| Database | `wp db export` on the server | exported by `project db-export`, downloaded with `scp` |
| Which project | from a path pattern in the profile, e.g. `/srv/projects/{projectName}` | picked from the server's `project list` at import |
| Git | origin discovered in the site's folder | repository and deployed branch from `project status` |

Either way, A-CLI only **reads** from the server — see [pull-only guarantees](./import-and-pull#pull-only-guarantees).

## Before you start

Make sure you can log in to the server yourself:

```bash
ssh -i ~/.ssh/your-key your-user@staging.example.com
```

If that works, A-CLI will work with the same host, user and key. For a Coolify server, also check that `project list` shows your projects. If it asks for a password or says permission denied, fix that first (your server administrator can add your key or grant you projects).

## Create a profile, step by step

```bash
acli profile create
```

(or **Profiles → Create a profile** in the `acli` menu)

<ol class="step-list">
<li>

**Profile name** — your name for this server, e.g. `agency-staging` or `coolify`. Lowercase letters, numbers, `-` and `_`. You'll use it with `--profile` and `acli profile use`.

</li>
<li>

**How does A-CLI reach this server?** — *SSH with wp-cli* or *Coolify project CLI* (see [the table above](#two-kinds-of-servers)).

</li>
<li>

**SSH host** — the server's address, e.g. `staging.example.com`.

</li>
<li>

**SSH port** — press Enter for `22` unless your server uses another port.

</li>
<li>

**SSH username** — the user you log in with.
- *Coolify:* your personal user, e.g. `developer`.
- *SSH:* can contain `{projectName}` when each site has its own user, e.g. `{projectName}` → `client-site` for the project `client-site`. Default: `{projectName}`.

</li>
<li>

**SSH private key** *(optional)* — path to the key, e.g. `~/.ssh/staging`. Leave empty to use your normal SSH setup (`~/.ssh/config`, ssh-agent).

</li>
<li>

**SSH host-key policy** — what to do with the server's host key:
- **Strict** *(recommended)* — the server must already be in `~/.ssh/known_hosts` (log in once by hand first).
- **Accept new** — trust the server the first time, then check it every time after.
- **Insecure** — never check. Only for throwaway test servers.

</li>
<li>

**SSH only — where the sites live:**
- **Remote project root** — the project's folder on the server, with `{projectName}`, e.g. `/srv/projects/{projectName}` or `/var/www/{projectName}`.
- **WordPress root relative to project root** — where `wp-config.php` is inside it, e.g. `wordpress`, `public` or `.`.
- **WordPress content directories** — what to copy from `wp-content`: uploads, plugins, themes (default) and optionally languages.

*Coolify profiles skip this step* — the server knows where each project lives.

</li>
<li>

**Staging URL** *(optional)* — e.g. `https://{projectName}.staging.example.com`. During import the site's own URL is always replaced with your local one; this adds one more URL to replace. Leave empty if you're not sure.

</li>
<li>

**Link the site's Git repository after import?** — *Yes* connects the imported project to the site's Git origin, pull-only, so you see real diffs right away. See [Git](./import-and-pull#git).

</li>
<li>

**Local Git SSH Host alias** *(optional)* — only if your `~/.ssh/config` uses an alias for your Git account (see [below](#git-accounts-and-ssh-aliases)). Otherwise leave it empty.

</li>
</ol>

A-CLI saves the profile and prints where. If it's your only profile, it's used automatically; otherwise make it the default:

```bash
acli profile use agency-staging
```

### What it looks like

A Coolify profile:

<AcliTerminal title="acli profile create">
<pre>◇  Profile name:
│  coolify
│
◇  How does A-CLI reach this server?
│  Coolify project CLI
│
◇  SSH host:
│  cloud.example.com
│
◇  SSH port:
│  22
│
◇  SSH username:
│  developer
│
◇  SSH private key (optional, e.g. ~/.ssh/id_ed25519):
│  ~/.ssh/cloud
│
◇  SSH host-key policy:
│  Accept new hosts
│
◇  Staging URL (optional, also replaced during import):
│  https://{projectName}.cloud.example.com
│
◇  Link the site's Git repository after import?
│  Yes
│
◇  Local Git SSH Host alias (optional, e.g. github-work):
│  github-work
│
Profile "coolify" saved to ~/Library/Application Support/a-cli/config.yaml.</pre>
</AcliTerminal>

It is stored as plain YAML in your user configuration:

::: code-group

```yaml [Coolify profile]
version: 1
profiles:
  coolify:
    type: wordpress
    provider: coolify-cli
    ssh:
      host: cloud.example.com
      port: 22
      username: developer
      identityFile: ~/.ssh/cloud
      hostKeyPolicy: accept-new
    git:
      enabled: true
      sshHostAlias: github-work
    urls:
      staging: https://{projectName}.cloud.example.com
defaults:
  profile: coolify
```

```yaml [SSH profile]
version: 1
profiles:
  agency-staging:
    type: wordpress
    ssh:
      host: staging.example.com
      port: 22
      username: "{projectName}"
      identityFile: ~/.ssh/staging
      hostKeyPolicy: strict
    remote:
      projectRoot: /srv/projects/{projectName}
      wordpressRoot: wordpress
    files:
      directories: [uploads, plugins, themes]
      excludes: ["*.log", node_modules]
    git:
      enabled: true
    urls:
      staging: https://{projectName}.staging.example.com
```

:::

You can edit this file by hand; `acli profile validate <name>` checks it. `acli config path` prints where it is:

| System | User configuration |
| --- | --- |
| macOS | `~/Library/Application Support/a-cli/config.yaml` |
| Linux | `~/.config/a-cli/config.yaml` (or `$XDG_CONFIG_HOME/a-cli/`) |
| Windows | `%APPDATA%\a-cli\config.yaml` |

## `{projectName}`

`{projectName}` is replaced with the **local project name** when you import or pull — the folder name, e.g. `client-site`. It lets one profile describe every project on a server that follows a pattern:

| In the profile | For `client-site` |
| --- | --- |
| `username: "{projectName}"` | `client-site` |
| `projectRoot: /srv/projects/{projectName}` | `/srv/projects/client-site` |
| `staging: https://{projectName}.staging.example.com` | `https://client-site.staging.example.com` |

Coolify profiles don't need it for the project itself: the project is picked from the server's list, and its exact server name ("Client Site") is remembered in the project.

## Without questions

Every question has an option, so a whole team can create the same profile with one command — each person only changes their user and key:

::: code-group

```bash [Coolify]
acli profile create coolify --provider coolify-cli \
  --host cloud.example.com --username YOUR_USER --identity-file ~/.ssh/YOUR_KEY \
  --host-key-policy accept-new \
  --staging-url 'https://{projectName}.cloud.example.com' --yes
```

```bash [SSH]
acli profile create agency-staging --provider ssh \
  --host staging.example.com --username '{projectName}' --identity-file ~/.ssh/staging \
  --project-root '/srv/projects/{projectName}' --wordpress-root wordpress \
  --directories uploads,plugins,themes --host-key-policy accept-new --yes
```

:::

Put this command in your team's internal docs. Profiles are per machine on purpose: they contain each developer's own user and key, and they are never read from a project's repository.

## Git accounts and SSH aliases

If you use different GitHub accounts through `~/.ssh/config`, e.g.

```ssh-config
Host github-work
  HostName github.com
  IdentityFile ~/.ssh/work
```

then set the same alias on the profile, so the imported project fetches with the right key:

```bash
acli profile git-alias coolify github-work
```

A-CLI then turns `git@github.com:org/site.git` into `git@github-work:org/site.git` for that profile's projects. HTTPS URLs are left alone. `acli profile git-alias coolify --clear` removes it.

## Managing profiles

| Command | Does |
| --- | --- |
| `acli profile list` | All profiles; `*` marks the default. |
| `acli profile current` | The default profile. |
| `acli profile use <name>` | Make a profile the default (`--clear` to unset). |
| `acli profile inspect <name>` | Print a profile (keys and passwords redacted). |
| `acli profile validate <name>` | Check a profile for mistakes. |
| `acli profile git-alias <name> [alias]` | Set or `--clear` the Git SSH alias. |
| `acli profile delete <name>` | Delete it (asks first; `--yes` to skip). |

Which profile a command uses: `--profile <name>` if given, otherwise the default, otherwise the only profile, otherwise A-CLI asks (or, with `--yes`, stops and asks you to pass `--profile`).

## When something goes wrong

| Message | What to do |
| --- | --- |
| `Profile "x" was not found.` | Check `acli profile list`; create it or fix the name. |
| `Missing or outdated tools: rsync.` | Install what's listed — the message says how. |
| `Project "x" is not assigned to …` (Coolify) | Use a name from the list it prints, or ask the administrator to grant you the project. |
| `Permission denied (publickey)` | Check that `ssh -i <key> <user>@<host>` works by hand. |
| `… declares profiles, which since A-CLI 2.1 live only in the user config` | A project's `.acli/config.yaml` has a `profiles:` block. Recreate the profile with `acli profile create` and remove the block. |
| `coolify.project is no longer part of a profile` | Remove `coolify.project` / `coolify.database` from the profile — the project is chosen at import now. |
| `database.driver "docker" is no longer supported` | A-CLI 2.1 exports SSH databases only with wp-cli. Remove the field; the server needs `wp`. |
| `uses a ${ENV_VAR} or {command: ...} reference` | Write the actual value; references aren't resolved anymore. |
