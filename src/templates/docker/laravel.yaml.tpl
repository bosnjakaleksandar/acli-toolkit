# Development environment for {{PROJECT_NAME}} (Laravel backend + frontend).
# Start: docker compose up
#   backend  → http://localhost:8000
#   frontend → http://localhost:{{FRONTEND_PORT}}
services:
  db:
    image: {{DB_IMAGE}}
    volumes:
      - db_data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: laravel
      MYSQL_USER: laravel
      MYSQL_PASSWORD: laravel
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -ppassword || mariadb-admin ping -h 127.0.0.1 -uroot -ppassword"]
      interval: 5s
      retries: 20

  backend:
    build:
      context: .
      dockerfile_inline: |
        FROM php:8.3-cli
        RUN apt-get update \
          && apt-get install -y --no-install-recommends git unzip libzip-dev \
          && docker-php-ext-install pdo_mysql zip \
          && rm -rf /var/lib/apt/lists/*
        COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
    working_dir: /app
    command: sh -c "composer install && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=8000"
    volumes:
      - ./backend:/app
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      # Real environment variables win over backend/.env.
      DB_CONNECTION: mysql
      DB_HOST: db
      DB_PORT: "3306"
      DB_DATABASE: laravel
      DB_USERNAME: laravel
      DB_PASSWORD: laravel

  frontend:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && {{FRONTEND_DEV_COMMAND}}"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    ports:
      - "127.0.0.1:{{FRONTEND_PORT}}:{{FRONTEND_PORT}}"
    environment:
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"

volumes:
  db_data:
  frontend_node_modules:
