# Development environment for {{PROJECT_NAME}} (React + Vite).
# Start: lando start — then open http://{{PROJECT_NAME}}.lndo.site
name: {{PROJECT_NAME}}
services:
  app:
    type: node:22
    port: 5173
    ssl: false
    scanner: false
    build:
      - npm install
    command: npm run dev -- --host 0.0.0.0 --port 5173
proxy:
  app:
    - {{PROJECT_NAME}}.lndo.site:5173
tooling:
  node:
    service: app
  npm:
    service: app
  npx:
    service: app
