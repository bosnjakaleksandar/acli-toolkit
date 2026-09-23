# Development environment for {{PROJECT_NAME}} (Next.js).
# Start: lando start — then open http://{{PROJECT_NAME}}.lndo.site
name: {{PROJECT_NAME}}
services:
  app:
    type: node:22
    port: 3000
    ssl: false
    scanner: false
    build:
      - npm install
    command: npm run dev -- --hostname 0.0.0.0 --port 3000
proxy:
  app:
    - {{PROJECT_NAME}}.lndo.site:3000
tooling:
  node:
    service: app
  npm:
    service: app
  npx:
    service: app
