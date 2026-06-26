services:
  frontend:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./frontend:/app
    ports:
      - "3000:3000"
    command: npm run dev
    depends_on:
      - backend

  backend:
    image: php:8.2-fpm
    working_dir: /var/www/html
    volumes:
      - ./backend:/var/www/html
    ports:
      - "8000:8000"
    command: php -S 0.0.0.0:8000 -t public
