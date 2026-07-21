# Laravel

Laravel combinations create a real Laravel application via `composer create-project laravel/laravel` in `backend/`, and a React or Next.js frontend (scaffolded by its own official generator, see [React](./react.md)/[Next.js](./nextjs.md)) in `frontend/`. Composer and PHP are required; no Docker or Lando environment is created — run each side with its own dev server.

```bash
acli create --preset laravel-react
acli create --preset laravel-next

cd <project>/backend && php artisan serve
# new terminal
cd <project>/frontend && npm install && npm run dev
```
