---
flow:
  - icon: wrench
    title: Check your machine
    text: Node.js, Git and Docker or Lando.
    link: "#check"
  - icon: package
    title: Install A-CLI
    command: npm i -g acli-toolkit
    link: "#install"
  - icon: key-round
    title: Create a profile
    text: Once per server.
    command: acli profile create
    link: "#profile"
  - icon: download
    title: Import the site
    text: Files, database, Git.
    command: acli import
    link: "#import"
  - icon: globe
    title: Open it locally
    command: localhost:8080
    link: "#open"
  - icon: refresh-cw
    title: Stay up to date
    command: acli pull db
    link: "#pull"
---

# Walkthrough: from zero to a running local site

<AcliMascot state="idle" boot message="Let's go from an empty machine to a WordPress site from staging running on your laptop. I'll show you what every step looks like." />

This page follows one real path end to end: install A-CLI, describe your staging server once, import an existing site, and keep it up to date. Every terminal below replays what A-CLI prints — press **Replay** to watch it again.

<AcliFlow :steps="$frontmatter.flow" />

::: tip Starting a brand-new project instead?
You don't need a server or a profile for that — run `acli create` and follow [Create a project](./create).
:::

## 1. Check your machine {#check}

A-CLI checks its own requirements before every command and tells you what's missing, but it's quicker to know up front. For importing a WordPress site you need:

| Tool | Check with | Why |
| --- | --- | --- |
| **Node.js 22.18+** and npm | `node --version` | A-CLI runs on Node. |
| **Git** | `git --version` | The imported site gets a Git repository. |
| **Docker** with Compose v2 — *or* **Lando** | `docker compose version` / `lando version` | The site runs in containers on your machine. |
| **ssh** | `ssh -V` | A-CLI reaches the server over SSH. |
| **rsync** (SSH servers) or **scp** + **tar** (Coolify servers) | `rsync --version` | How files are copied down. |

You **don't** need PHP, MySQL or WP-CLI locally — they run inside the containers.

## 2. Install A-CLI {#install}

<AcliReplay session="install" title="~ install" />

Then run `acli` with no arguments. The bot boots up and shows the main menu — every entry is also a command you can run directly:

<AcliTerminal title="~ acli">
<AcliBanner compact />
<AcliMascot state="idle" message="Ready to build something awesome?" />
<pre>◆  What would you like to do?
│  ○ Create a project
│  ○ Import an existing WordPress site
│  ● Profiles
│  ○ Link an existing project to a staging profile
│  ○ Pull files/database from a linked profile
│  ○ Show command help</pre>
</AcliTerminal>

## 3. Make sure you can reach the server {#ssh}

A profile uses your normal SSH setup, so first check you can log in by hand with the user and key you were given:

```bash
ssh -i ~/.ssh/cloud developer@cloud.example.com
```

- <AcliIcon name="circle-check" class="acli-status is-ok" /> **You get a shell** → continue. On a Coolify server, `project list` should show your projects.
- <AcliIcon name="circle-x" class="acli-status is-bad" /> **It asks for a password** or says `Permission denied (publickey)` → ask your server administrator to add your public key (or grant you the project) before going on.
- <AcliIcon name="triangle-alert" class="acli-status is-warn" /> **"The authenticity of host … can't be established"** → answer `yes` once. That puts the server in `~/.ssh/known_hosts`, which the recommended *Strict* host-key policy needs.

## 4. Create a profile {#profile}

A profile describes the **server**, not one site — you create it once and use it for every project on that server. Run `acli profile create` (or pick **Profiles → Create a profile** in the menu) and answer the questions:

<AcliReplay session="profile" title="~ acli profile create" />

What each answer means:

| Question | What to enter |
| --- | --- |
| Profile name | Your name for the server, e.g. `coolify` or `agency-staging`. |
| How does A-CLI reach this server? | **Coolify project CLI** when the server gives you the `project` command; **SSH with wp-cli** when you can SSH into the site's folder. [Compare →](./profiles#two-kinds-of-servers) |
| SSH host / port / username / key | Exactly what worked in [step 3](#ssh). |
| SSH host-key policy | *Strict* if you already logged in once; *Accept new hosts* to trust it on first contact. |
| Staging URL | Optional. `{projectName}` is replaced with the site's local name. |
| Link the site's Git repository? | **Yes** — you'll see how staging differs from the repository right away. |
| Local Git SSH Host alias | Only if your `~/.ssh/config` uses an alias like `github-work` for your Git account. |

SSH profiles also ask where the sites live (`/srv/projects/{projectName}`) and which `wp-content` folders to copy — see [Profiles](./profiles#create-a-profile-step-by-step).

If this is your only profile it's used automatically. With several, pick the default:

```bash
acli profile use coolify
```

::: tip Setting up a team?
Every question has an option, so you can share one command that creates the same profile on every machine — each person only swaps their own user and key. [See how →](./profiles#without-questions)
:::

## 5. Import the site {#import}

Go to the folder where you keep your projects and run `acli import`. With a Coolify profile, A-CLI lists the projects the server gives you:

<AcliReplay session="import" title="~/Sites — acli import" />

Here's what just moved, and in which direction:

<AcliPullDiagram />

Behind that spinner A-CLI checked your tools and the server, downloaded `wp-content`, exported and downloaded the database, detected the table prefix, wrote `docker-compose.yaml`, linked Git, started the containers, imported the database and replaced the staging URLs with your local one. The full list is in [What happens](./import-and-pull#what-happens).

The new folder:

```text
client-site/
├── .acli/config.yaml     ← link to the profile — `acli pull` reads it
├── docker-compose.yaml   ← or .lando.yml
├── wp-content/           ← uploads, plugins, themes, languages
├── .git/                 ← origin = the site's repository, pull-only
└── .gitignore
```

::: warning If the import stops half-way
Nothing already downloaded is deleted. A-CLI prints the exact command to continue — e.g. `acli import "Client Site" --resume --name client-site` — and skips the steps that already finished.
:::

## 6. Open the site {#open}

The containers are already running. Open the local URL:

<div class="acli-browser">
<div class="acli-browser__bar"><span class="acli-terminal__dot"></span><span class="acli-terminal__dot"></span><span class="acli-terminal__dot"></span><span class="acli-browser__url">http://localhost:8080</span></div>
<div class="acli-browser__body">
<p class="acli-browser__icon"><AcliIcon name="party-popper" size="40" /></p>
<p><strong>Your staging site, running locally.</strong></p>
<p>Admin: <code>http://localhost:8080/wp-admin</code></p>
</div>
</div>

| Environment | Local URL |
| --- | --- |
| Docker | `http://localhost:8080` |
| Lando | `https://client-site.lndo.site` |

Log in to `/wp-admin` with **your staging account** — the database is a copy, so the users are the same. Start and stop the site with `docker compose up -d` / `docker compose down` (or `lando start` / `lando stop`) inside the project.

If the theme has a `package.json`, A-CLI offers to install its dependencies and prints the `npm run dev` command under **Next**.

## 7. Stay up to date {#pull}

Staging moves on; pull just what you need, from anywhere inside the project:

<AcliReplay session="pull" title="~/Sites/client-site — acli pull db" />

```bash
acli pull db                 # just the database (asks first — it replaces yours)
acli pull uploads plugins    # just some folders
acli pull full --yes         # everything, no questions
```

Your code changes go through Git as usual — `git status` shows what differs from the repository. A-CLI never commits or pushes.

## Already cloned the repository? {#link}

If you have the site's repository on disk already, you don't need `acli import` — connect the folder to the profile and pull the rest:

```bash
cd client-site
acli link --profile coolify --environment docker --remote-project "Client Site"
acli pull full
```

`acli link` offers to generate the Docker/Lando file when there isn't one. After that, `acli pull` works exactly as above.

## Checklist

<ol class="step-list">
<li><code>node --version</code> shows 22.18 or newer, and Docker or Lando is running.</li>
<li><code>npm install --global acli-toolkit</code></li>
<li><code>ssh</code> to the server works by hand.</li>
<li><code>acli profile create</code> — once per server.</li>
<li><code>acli import</code> — once per site.</li>
<li>Open <code>http://localhost:8080</code>.</li>
<li><code>acli pull db</code> whenever you need fresh data.</li>
</ol>

<AcliMascot state="success" message="That's the whole loop. Stuck somewhere? Add --verbose and I'll show every command I run — or check the FAQ." />

Next: [Profiles in depth](./profiles) · [Import & pull in depth](./import-and-pull) · [FAQ & troubleshooting](../faq)
