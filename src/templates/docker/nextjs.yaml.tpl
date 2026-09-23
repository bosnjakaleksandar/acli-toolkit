# Development environment for {{PROJECT_NAME}} (Next.js).
# Start: docker compose up — then open http://localhost:3000
services:
  app:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev -- --hostname 0.0.0.0 --port 3000"
    volumes:
      - .:/app
      # node_modules and the Next.js build cache stay inside the container:
      # packages built for Linux must not mix with the ones on your machine.
      - node_modules:/app/node_modules
      - next_cache:/app/.next
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      # File watching through Docker Desktop's file sharing needs polling.
      WATCHPACK_POLLING: "true"

volumes:
  node_modules:
  next_cache:
