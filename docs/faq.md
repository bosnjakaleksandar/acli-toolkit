# FAQ & troubleshooting

<AcliMascot state="warning" message="Something went sideways? Start with --verbose — I'll show every command I run." />

## General

### Does A-CLI change anything on the staging server?

No. It only reads: files and database are exported and downloaded, and Git is fetched. Pushing, deploying and importing on the server are blocked in code — see [pull-only guarantees](./guide/import-and-pull#pull-only-guarantees).

### Do I need a profile to create a project?

No. Profiles are only for importing and pulling existing WordPress sites.

### Can one profile be used for many projects?

Yes — that's the point. A profile describes the server; the project is chosen at import. See [Profiles](./guide/profiles).

### Can I share a profile with my team?

Share the command, not the file: [`acli profile create … --yes`](./guide/profiles#without-questions) with each person's own user and key. Profiles live in each developer's user config and are never read from a repository.

### Do I need WP-CLI on my machine?

No. Docker and Lando environments run `wp` inside the container. An SSH server does need `wp` for exporting the database.

## When something fails

### A command stopped half-way

Run the resume command A-CLI printed (e.g. `acli import "Client Site" --resume --name client-site`). Nothing already downloaded is deleted, and finished steps are skipped.

### "Missing or outdated tools"

Install what the message lists — each tool comes with an install hint. A-CLI checks only what the command you ran needs.

### SSH asks for a password or hangs

A-CLI uses your normal SSH. Check that `ssh -i <key> <user>@<host>` logs in without a password, and that the profile's `identityFile` and `username` match. With host-key policy `strict`, log in once by hand so the server is in `known_hosts`.

### Git fetch fails with "Permission denied (publickey)"

Your Git account probably uses an `~/.ssh/config` alias. Set it on the profile — `acli profile git-alias <profile> <alias>` — and resume. [Details →](./guide/profiles#git-accounts-and-ssh-aliases)

### "Could not detect the WordPress table prefix"

Add `database.tablePrefix: wp_` (your site's prefix) to the profile and resume.

### Coolify: "has several database containers"

The server asked which database to use. Run the same command without `--yes` and pick the one WordPress uses (check `DB_HOST` in `wp-config.php` or the project in Coolify). The answer is remembered for the project.

### My configuration is rejected after updating to 3.0

3.0 removed a few older features. The message names the field and what to do:

| Message mentions | Do this |
| --- | --- |
| `profiles` in a project's `.acli/config.yaml` | Recreate the profile with `acli profile create`, remove the block. |
| `coolify.project` or `coolify.database` | Remove them — the project is chosen at import. |
| `database.driver` / `files.transport` | Remove them — SSH servers use wp-cli and rsync. |
| `${ENV_VAR}` or `{command: …}` | Write the value itself. |
| `presets` | Move shared values to `defaults`; pass the rest as `acli create` options. |

## Coming from `create-project`

The old `create-project` command still works: it prints a deprecation warning and forwards to `acli create`. Its staging convention (Docker container found by name, `STAGING_SSH_HOST`) is no longer supported — create an [SSH profile](./guide/profiles) for a server with wp-cli, or a Coolify profile.
