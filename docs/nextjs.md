# Next.js

Next.js projects are scaffolded by [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) itself (TypeScript, ESLint, App Router, `src/`), so the generated app always reflects Next.js's own current templates and dependency versions rather than a hand-maintained copy that can drift out of date. `npm` is required; no Docker or Lando environment is created — run the app directly with its own dev server.

```bash
acli create --preset next
cd <project>
npm install
npm run dev
```
