# Contributing

Thanks for considering a contribution to A-CLI (`acli-toolkit`).

## Getting started

```bash
git clone https://github.com/bosnjakaleksandar/project-setup.git
cd project-setup
npm install
npm run build   # compiles src/ -> dist/ and copies templates
npm test        # typecheck + the full test suite
```

Node `>=20` is required; CI also runs the full suite on Node 22 (needed for native TypeScript execution in tests) and a Node 20 smoke test against the built `dist/`.

## Making a change

- Run `npm test` before opening a PR — it runs `tsc --noEmit` against the test project plus the full `node --test` suite.
- Tests live in `test/` as flat files (`node --test` picks up `test/*.test.{js,ts}`), one `test()` per behavior, named as a full sentence describing the invariant (see any existing file for the style). Prefer dependency injection (an injectable `runner`/`commandRunner` function) over mocking modules.
- If you touch anything that spawns a process, builds a shell command string, or parses `.acli/config.yaml`, please add a test — this codebase has had real command-injection findings fixed before (see the security-hardening commits), and the test suite is what keeps them fixed.
- Don't add a feature flag or backwards-compatibility shim for something you can just change directly — this is a CLI installed fresh via npm, not a library other code depends on at specific versions.

## Reporting bugs vs. security issues

Regular bugs: open a GitHub issue.

Anything that could let one project/config/repo affect another (command injection, secret exposure, SSRF-like behavior against configured hosts, etc.): please follow [SECURITY.md](SECURITY.md) instead of filing a public issue.

## Pull requests

- Keep PRs focused — one behavior change per PR is easier to review and bisect later.
- Explain the *why* in the PR description; the diff already shows the *what*.
- CI (`.github/workflows/test.yml`) must pass before merge.
