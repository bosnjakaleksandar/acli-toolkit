name: {{PROJECT_NAME}}
recipe: laravel
config:
  webroot: backend/public
  php: '8.2'
  database: mysql:8.0
services:
  frontend:
    type: node:18
    overrides:
      ports:
        - "3000:3000"
tooling:
  npm:
    service: frontend
  node:
    service: frontend
