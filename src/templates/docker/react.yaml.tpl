# Development environment for {{PROJECT_NAME}} (React + Vite).
# Start: docker compose up — then open http://localhost:5173
services:
  app:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0 --port 5173"
    volumes:
      - .:/app
      # node_modules stays inside the container: packages built for Linux
      # must not mix with the ones installed on your machine.
      - node_modules:/app/node_modules
    ports:
      - "127.0.0.1:5173:5173"
    environment:
      # File watching through Docker Desktop's file sharing needs polling.
      CHOKIDAR_USEPOLLING: "true"

volumes:
  node_modules:
