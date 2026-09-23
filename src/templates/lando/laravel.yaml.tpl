# Development environment for {{PROJECT_NAME}} (Laravel backend + frontend).
# Start: lando start
#   backend  → https://{{PROJECT_NAME}}.lndo.site
#   frontend → http://frontend.{{PROJECT_NAME}}.lndo.site
name: {{PROJECT_NAME}}
recipe: laravel
config:
  webroot: backend/public
  php: "8.3"
  composer_version: 2
  database: {{DB_IMAGE}}
services:
  appserver:
    scanner: false
    overrides:
      environment:
        # Real environment variables win over backend/.env.
        DB_CONNECTION: mysql
        DB_HOST: database
        DB_PORT: "3306"
        DB_DATABASE: laravel
        DB_USERNAME: laravel
        DB_PASSWORD: laravel
    build:
      - cd /app/backend && composer install
    run:
      - cd /app/backend && php artisan migrate --force
  database:
    creds:
      user: laravel
      password: laravel
      database: laravel
  frontend:
    type: node:22
    port: {{FRONTEND_PORT}}
    ssl: false
    scanner: false
    build:
      - cd /app/frontend && npm install
    command: sh -c "cd /app/frontend && {{FRONTEND_DEV_COMMAND}}"
proxy:
  frontend:
    - frontend.{{PROJECT_NAME}}.lndo.site:{{FRONTEND_PORT}}
tooling:
  artisan:
    service: appserver
    cmd: php /app/backend/artisan
  composer:
    service: appserver
    dir: /app/backend
  npm:
    service: frontend
    dir: /app/frontend
