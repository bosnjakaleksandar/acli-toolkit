---
layout: home

hero:
  name: A-CLI
  text: Developer Toolkit
  tagline: Start new projects in one command, and pull any WordPress site from staging into a local Docker or Lando setup — without ever touching the server.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Create a profile
      link: /guide/profiles
    - theme: alt
      text: GitHub
      link: https://github.com/bosnjakaleksandar/acli-toolkit

features:
  - icon: 🚀
    title: Create projects
    details: React (Vite), Next.js, Laravel with React or Next.js, and WordPress themes — with Docker or Lando for WordPress, a Git repo and next steps ready.
    link: /guide/create
    linkText: Create a project
  - icon: 🔑
    title: One profile per server
    details: Describe how to reach a staging server once — SSH with wp-cli, or a Coolify server's project CLI — and use it for every project on it.
    link: /guide/profiles
    linkText: Set up a profile
  - icon: 📥
    title: Import & pull WordPress
    details: Files, database, table prefix, URL replacement, local environment and Git — in one step. Later, <code>acli pull db</code> refreshes just what you need.
    link: /guide/import-and-pull
    linkText: Import a site
  - icon: 🛡️
    title: Pull-only by design
    details: A-CLI never pushes, deploys or imports anything on the server. The guarantee is enforced in code, not left to convention.
    link: /guide/import-and-pull#pull-only-guarantees
    linkText: How it's enforced
---
