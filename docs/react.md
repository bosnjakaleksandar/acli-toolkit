# React

React projects are scaffolded by [`create-vite`](https://vite.dev) itself (`--template react`), so the generated app always reflects Vite's own current templates and dependency versions rather than a hand-maintained copy that can drift out of date. `npm` is required; no Docker or Lando environment is created — run the app directly with its own dev server.

```bash
acli create --preset react
cd <project>
npm install
npm run dev
```
