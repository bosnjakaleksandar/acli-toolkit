# Dead Code & Clarity Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code found in the 2026-10-06 review, remove the deprecated `create-project` executable entirely, clean up three unclear spots (`--existing` in help, reduced-motion env aliases, a misleading comment), keep internal plan files out of the published docs site, and update the documentation and CHANGELOG to match.

**Architecture:** No new modules. Each task edits existing files in place and pins the behavior it touches with a test in the existing flat `test/*.test.{js,ts}` style (`node --test`, one `test()` per behavior, named as a full sentence).

**Tech Stack:** Node ≥ 22.18 (native TS stripping), TypeScript 7 (`tsc --noEmit` typecheck), commander 15, `node:test`, VitePress docs (English in `docs/`, Serbian in `docs/sr/`).

**Spec:** The review findings in this conversation (dead code list + "Nejasnoće" items 1–6), plus the user's follow-up: delete `create-project` entirely and add VitePress `srcExclude`. There is no separate spec file.

## Global Constraints

- Branch: code work happens on a new branch `chore/cleanup` created from `main` in a separate worktree, because `fe/docs` has uncommitted docs work. Command: `git worktree add ../project-setup-cleanup -b chore/cleanup main`, then `cd ../project-setup-cleanup && npm ci`.
- `docs/sr/` and the rewritten `docs/.vitepress/config.mjs` exist only as uncommitted work on `fe/docs`, so the Serbian FAQ edit (Task 6) and the `srcExclude` change (Task 7) happen there, not on `chore/cleanup`.
- Never open a PR or merge to `main` until the user says so.
- No `Co-Authored-By` or other AI attribution lines in commit messages.
- Commit message style: Conventional Commits, scoped (`fix(cli): …`, `refactor: …`, `docs: …`), like the existing history.
- Public behavior of every command stays the same except where a task explicitly says it changes (Tasks 2–4).
- Removing the `create-project` executable (Task 2) is a breaking change: the next release that contains it must be **4.0.0**, not a 3.x patch or minor.
- `npm test` (= `npm run typecheck && node --test`) must pass after every task.

## Review Focus

1. The published npm tarball must not ship `bin/create-project`, and `package.json` / `package-lock.json` must not declare it. Otherwise a global install still creates a dead `create-project` link. Covered by Task 2's packaging and manifest assertions.
2. `acli` called with no subcommand (main menu) or with bare flags must behave as before once `run()` loses its `legacyExecutable` option. Covered by the existing `cli.test.js` tests (`--version`, `--help`), which keep passing.
3. Someone who scripted `acli create --existing` still needs the "use `acli import`" hint, even though the flag is hidden from help. Covered by the existing `create --existing returns a usage error…` test (kept) plus Task 3's "still registered, hidden" test.
4. `acli create --dry-run` output must not change when the unused `buildPlan` hook is removed. Pinned by a new dry-run test written *before* the removal in Task 1.
5. A user who set the undocumented `NO_MOTION` / `REDUCED_MOTION` / `A_CLI_REDUCED_MOTION` gets animations back after Task 4. That is intended, and it is announced under **Removed** in the CHANGELOG (Task 5).
6. Internal plans under `docs/superpowers/` must never appear on the GitHub Pages site. Task 7 verifies this by building the docs and checking the output.

---

### Task 1: Remove dead code and unneeded exports

**Files:**
- Modify: `src/projects/strategies/ScaffoldStrategy.ts:39-40`
- Modify: `src/cli/commands/create.ts:66-72,123`
- Modify: `src/projects/prompts/projectPrompts.ts:117,136`
- Modify: `src/update/cache.ts:7`
- Modify (drop `export` keyword only): `src/cli/commands/update.ts`, `src/config/paths.ts`, `src/core/StepRunner.ts`, `src/environments/EnvironmentRegistry.ts`, `src/profiles/ProfileStore.ts`, `src/projects/plan/PlanBuilder.ts`, `src/projects/strategies/registry.ts`, `src/providers/coolify/CoolifyProjectHost.ts`, `src/system/preflight.ts`, `src/ui/mascot.ts`, `src/wordpress/wpCliInstaller.ts`
- Test: `test/import-command-unification.test.ts` (add one test)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ScaffoldStrategy` no longer has `buildPlan?`. No exported name used by any other file or test is removed.

- [ ] **Step 1: Pin the current `create --dry-run` output**

Add to `test/import-command-unification.test.ts`, directly after the `create --existing returns a usage error…` test (it reuses that file's `withCwd` and `captureCliRun` helpers):

```ts
test("create --dry-run prints the generic project plan without touching the filesystem", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "acli-create-dry-run-"));
  const result = await withCwd(dir, () => captureCliRun(() => createProjectCommand({
    name: "dry-app",
    type: "application",
    framework: "react",
    environment: "none",
    dryRun: true,
    yes: true,
  })));

  assert.equal(result.exitCode, undefined);
  assert.match(result.output, /"project": "dry-app"/);
  assert.match(result.output, /"projectType": "react"/);
  assert.match(result.output, /"localEnvironment": "none"/);
  assert.doesNotMatch(result.output, /"laravel"/);
  assert.equal(await fs.pathExists(path.join(dir, "dry-app")), false);
  await fs.remove(dir);
});
```

- [ ] **Step 2: Run it. It should pass, because this pins the current behavior**

Run: `node --test test/import-command-unification.test.ts`
Expected: all tests pass, including the new one. If it fails, stop and fix the test inputs. The refactor must not start until the current behavior is pinned.

- [ ] **Step 3: Remove the unused `buildPlan` hook**

In `src/projects/strategies/ScaffoldStrategy.ts`, delete these two lines (no strategy implements the hook):

```ts
  /** Opt-in: a richer `--dry-run` plan than the generic {project, projectType, localEnvironment} fallback. */
  buildPlan?(ctx: ProjectPlan): unknown;
```

In `src/cli/commands/create.ts`, replace:

```ts
      const plan = strategy.buildPlan ? strategy.buildPlan(ctx) : {
        project: ctx!.projectName,
        projectType: ctx!.projectType,
        localEnvironment: ctx!.environment,
        ...(ctx!.useLaravel ? { laravel: true } : {}),
      };
```

with:

```ts
      const plan = {
        project: ctx!.projectName,
        projectType: ctx!.projectType,
        localEnvironment: ctx!.environment,
        ...(ctx!.useLaravel ? { laravel: true } : {}),
      };
```

In the same file, remove the needless cast (`buildSuccessSummary` already accepts `ProjectPlan`, because its extra fields are optional):

```ts
    outro(buildSuccessSummary(targetDir, finalCtx as any, nextSteps));
```
→
```ts
    outro(buildSuccessSummary(targetDir, finalCtx, nextSteps));
```

- [ ] **Step 4: Remove the two dead re-exports**

`src/projects/prompts/projectPrompts.ts`: delete the line `export { validateProjectName };` (line 117) and the blank line after it. Every caller imports from `../plan/projectName.ts`.

`src/update/cache.ts`: delete the line `export { getUpdateCachePath };` (line 7). The import on line 3 stays, because the file still uses it.

- [ ] **Step 5: Fix the misleading comment**

`src/projects/prompts/projectPrompts.ts:136`:

```ts
  // Legacy import fields never survive editing a new-project plan.
```
→
```ts
  // Import-only fields (`acli import`'s profile and staging URL) never survive editing a new-project plan.
```

- [ ] **Step 6: Drop `export` from symbols used only in their own file**

Change `export function` → `function`, `export async function` → `async function`, `export const` → `const`, `export interface` → `interface` for exactly these declarations:

| File | Symbols |
|---|---|
| `src/cli/commands/update.ts` | `updateCommand`, `checkUpdateCommand` |
| `src/config/paths.ts` | `getUserConfigDir`, `getProjectConfigDir` |
| `src/core/StepRunner.ts` | `clearStepState` |
| `src/environments/EnvironmentRegistry.ts` | `listEnvironmentAdapters` |
| `src/profiles/ProfileStore.ts` | `resolveProfileConfigPath`, `validateProfileName` |
| `src/projects/plan/PlanBuilder.ts` | `normalizeFramework`, `normalizeWpType` |
| `src/projects/strategies/registry.ts` | `projectTypeRegistry`, `ProjectTypeDefinition` |
| `src/providers/coolify/CoolifyProjectHost.ts` | `COOLIFY_FILE_TARGETS` |
| `src/system/preflight.ts` | `isPortAvailable` |
| `src/ui/mascot.ts` | `ACA_TIMING` |
| `src/wordpress/wpCliInstaller.ts` | `WP_CLI_VERSION` |

Leave these type exports alone even though knip flags them: `ErrorRenderer` (`CommandShell.ts`), `ProviderPlanContext`, `ProjectTarget`, `RemoteGitOrigin`, `SyncFilesOptions` (`providers/contract.ts`, re-exported by `providers/registry.ts`). They describe the provider/shell contracts that implementers read.

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: typecheck clean, all tests pass.

Run: `npx --yes knip --no-progress --reporter compact`
Expected: **Unused exports** section is gone. Only the five contract types above and the `docs/.vitepress/*` files remain. The docs files are a false positive, because VitePress loads them.

- [ ] **Step 8: Commit**

```bash
git add src test/import-command-unification.test.ts
git commit -m "refactor: remove dead code and exports used only internally"
```

---

### Task 2: Remove the deprecated `create-project` executable

**Files:**
- Delete: `bin/create-project`
- Modify: `package.json:26-29` (`bin`), `package-lock.json` (regenerated)
- Modify: `src/cli/run.ts:11-13,51-56`
- Test: `test/cli.test.js:9,34-39`, `test/packaging.test.js:27-29`
- Modify: `docs/faq.md:65-67`

**Interfaces:**
- Consumes: nothing.
- Produces: `run(argv: string[] = process.argv): Promise<void>`. The second `{ legacyExecutable }` parameter is removed, and `normalizeLegacyArguments` no longer exists. `bin/acli` and `scripts/dev.mjs` already call `run()` with no arguments, so no caller changes.

- [ ] **Step 1: Write the failing tests**

In `test/cli.test.js`, delete the `legacyBin` constant (line 9):

```js
const legacyBin = fileURLToPath(new URL("../bin/create-project", import.meta.url));
```

and replace the whole test `legacy executable warns and preserves root commands` (lines 34–39) with:

```js
test("acli is the only executable the package declares", () => {
  const manifest = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  assert.deepEqual(Object.keys(manifest.bin), ["acli"]);
  assert.equal(fs.existsSync(fileURLToPath(new URL("../bin/create-project", import.meta.url))), false);
});
```

In `test/packaging.test.js`, inside the `for (const filePath of paths)` loop, add as the last assertion:

```js
    assert.notEqual(filePath, "bin/create-project", "tarball should not ship the removed create-project executable");
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `node --test test/cli.test.js test/packaging.test.js`
Expected: FAIL. `Object.keys(manifest.bin)` is `["acli", "create-project"]`, and the tarball contains `bin/create-project`.

- [ ] **Step 3: Delete the executable and its manifest entry**

```bash
git rm bin/create-project
```

`package.json`, change:

```json
  "bin": {
    "acli": "./bin/acli",
    "create-project": "./bin/create-project"
  },
```
→
```json
  "bin": {
    "acli": "./bin/acli"
  },
```

Then regenerate the lockfile without touching `node_modules`:

```bash
npm install --package-lock-only
git diff package-lock.json
```

Expected diff: only the `"create-project": "bin/create-project"` line under the root package's `bin` disappears. If other entries change, stop and run `git checkout package-lock.json`, then remove that one line by hand.

- [ ] **Step 4: Remove the legacy argument rewriting from `run()`**

`src/cli/run.ts`, replace:

```ts
export async function run(argv: string[] = process.argv, { legacyExecutable = false }: { legacyExecutable?: boolean } = {}): Promise<void> {
  const packageMetadata = await getPackageMetadata();
  const normalizedArgv = legacyExecutable ? normalizeLegacyArguments(argv) : argv;
  const args = normalizedArgv.slice(2);
```

with:

```ts
export async function run(argv: string[] = process.argv): Promise<void> {
  const packageMetadata = await getPackageMetadata();
  const args = argv.slice(2);
```

and further down:

```ts
  await program.parseAsync(normalizedArgv);
```
→
```ts
  await program.parseAsync(argv);
```

Delete the whole `normalizeLegacyArguments` function at the end of the file:

```ts
function normalizeLegacyArguments(argv: string[]): string[] {
  const args = argv.slice(2);
  const rootArguments = new Set(["create", "import", "update", "link", "pull", "help", "--help", "-h", "--version", "-v"]);
  if (args.some((argument) => rootArguments.has(argument))) return argv;
  return [...argv.slice(0, 2), "create", ...args];
}
```

- [ ] **Step 5: Confirm nothing else refers to it**

Run: `grep -rn "create-project\|legacyExecutable\|normalizeLegacy" src bin scripts test package.json`
Expected: only the Laravel `composer create-project` hits in `src/projects/strategies/LaravelStrategy.ts` and `test/delegated-scaffold-strategies.test.js`. Those are Composer's command, not ours, so leave them.

- [ ] **Step 6: Remove the English FAQ section**

In `docs/faq.md`, delete the whole section, including its heading and the blank line before it:

```md
## Coming from `create-project`

The old `create-project` command still works: it prints a deprecation warning and forwards to `acli create`. Its staging convention (Docker container found by name, `STAGING_SSH_HOST`) is no longer supported — create an [SSH profile](./guide/profiles) for a server with wp-cli, or a Coolify profile.
```

Then check that no other page links to its anchor:

Run: `grep -rn "coming-from-create-project" docs README.md --exclude-dir=node_modules`
Expected: no hits on this branch. On `fe/docs`, `docs/sr/faq.md` still has it, and Task 6 removes it.

- [ ] **Step 7: Full test run and commit**

Run: `npm test`
Expected: PASS.

```bash
git add -A bin package.json package-lock.json src/cli/run.ts test/cli.test.js test/packaging.test.js docs/faq.md
git commit -m "feat(cli)!: remove the deprecated create-project executable

BREAKING CHANGE: the create-project executable is gone; use acli create."
```

---

### Task 3: Hide `--existing` from `acli create --help`

**Files:**
- Modify: `src/cli/commands/create.ts:4,137`
- Test: `test/cli-command-boundaries.test.ts:21-28`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new. `CreateCommandOptions.existing` stays, and `createProjectCommand({ existing: true })` behaves exactly as before.

- [ ] **Step 1: Update and add the tests (they should fail)**

In `test/cli-command-boundaries.test.ts`, replace the test:

```ts
test("create help contains only new-project controls plus the compatibility error flag", () => {
  const help = commandHelp(registerCreateCommand, "create");
  assert.match(help, /--existing/);
```

with:

```ts
test("create help contains only new-project controls", () => {
  const help = commandHelp(registerCreateCommand, "create");
  assert.doesNotMatch(help, /--existing/);
```

(keep the rest of that test body unchanged), and add after it:

```ts
test("create still accepts the hidden --existing flag so old scripts get the acli import hint", () => {
  const program = new Command();
  registerCreateCommand(program);
  const create = program.commands.find((command) => command.name() === "create")!;
  const existing = create.options.find((option) => option.long === "--existing");
  assert.ok(existing, "--existing must stay registered");
  assert.equal(existing.hidden, true);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `node --test test/cli-command-boundaries.test.ts`
Expected: FAIL. The help test finds `--existing`, and `existing.hidden` is `false`.

- [ ] **Step 3: Implement**

`src/cli/commands/create.ts` line 4:

```ts
import type { Command } from "commander";
```
→
```ts
import { Option, type Command } from "commander";
```

Line 137:

```ts
    .option("--existing", "Unsupported compatibility flag; use `acli import`")
```
→
```ts
    .addOption(new Option("--existing", "Unsupported compatibility flag; use `acli import`").hideHelp())
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: PASS, including the unchanged `create --existing returns a usage error and never delegates to import` test in `test/import-command-unification.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/create.ts test/cli-command-boundaries.test.ts
git commit -m "fix(create): hide the unsupported --existing flag from help"
```

(The docs never mention `--existing`, so no docs change is needed. The CHANGELOG is updated in Task 5.)

---

### Task 4: One documented reduced-motion variable

**Files:**
- Modify: `src/ui/mascot.ts:235-238`
- Test: `test/acaCharacter.test.js`, `test/banner.test.js:61-63`

**Interfaces:**
- Consumes: nothing.
- Produces: `AcaCharacter#canAnimate()` honours only `ACLI_REDUCED_MOTION` (plus the existing non-TTY / `CI` / `TERM=dumb` checks).

- [ ] **Step 1: Write the failing test**

Add to `test/acaCharacter.test.js` (it already imports `AcaCharacter` and defines `createOutput`):

```js
test("only the documented ACLI_REDUCED_MOTION variable disables animation", () => {
  for (const name of ["A_CLI_REDUCED_MOTION", "REDUCED_MOTION", "NO_MOTION"]) {
    const character = new AcaCharacter({ stdout: createOutput(), env: { [name]: "1" }, manageProcess: false });
    assert.equal(character.canAnimate(), true, `${name} is not a supported variable`);
  }
  const reduced = new AcaCharacter({ stdout: createOutput(), env: { ACLI_REDUCED_MOTION: "1" }, manageProcess: false });
  assert.equal(reduced.canAnimate(), false);
});
```

In `test/banner.test.js`, test `reduced motion disables animation even for a TTY`, change:

```js
  await showBanner({ stdout, env: { A_CLI_REDUCED_MOTION: "1" } });
```
→
```js
  await showBanner({ stdout, env: { ACLI_REDUCED_MOTION: "1" } });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/acaCharacter.test.js`
Expected: FAIL with `A_CLI_REDUCED_MOTION is not a supported variable`.

- [ ] **Step 3: Implement**

`src/ui/mascot.ts`, in `canAnimate()`:

```ts
    return ![this.env.ACLI_REDUCED_MOTION, this.env.A_CLI_REDUCED_MOTION, this.env.REDUCED_MOTION, this.env.NO_MOTION]
      .some(isEnabled);
```
→
```ts
    return !isEnabled(this.env.ACLI_REDUCED_MOTION);
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/mascot.ts test/acaCharacter.test.js test/banner.test.js
git commit -m "refactor(ui): honour only the documented ACLI_REDUCED_MOTION variable"
```

(`.env.example` and `docs/reference/configuration.md` / `docs/sr/reference/configuration.md` already list only `ACLI_REDUCED_MOTION`, so no docs change is needed.)

---

### Task 5: CHANGELOG and final verification

**Files:**
- Modify: `CHANGELOG.md` (under `## [Unreleased]`)

- [ ] **Step 1: Add the Unreleased entries**

Directly under `## [Unreleased]` in `CHANGELOG.md`:

```md
This release removes the deprecated `create-project` executable, so it is a major version.

### Changed

- `acli create --help` no longer lists the unsupported `--existing` flag; passing it still explains that existing sites use `acli import`.

### Removed

- The `create-project` executable, deprecated since `acli create` replaced it. Use `acli create` (and `acli <command>` for everything else).
- The undocumented `A_CLI_REDUCED_MOTION`, `REDUCED_MOTION` and `NO_MOTION` variables. Use `ACLI_REDUCED_MOTION=1`.
```

- [ ] **Step 2: Full verification, including a clean build**

Run: `npm test && npm run build && npx --yes knip --no-progress --reporter compact`
Expected: tests pass. `dist/` is rebuilt from scratch, so the stale `dist/starters/` from another branch is gone (`ls dist` shows no `starters`). knip reports only the five contract types and the `docs/.vitepress/*` false positives.

Run: `npm pack --dry-run 2>&1 | grep bin/`
Expected: exactly one line, `bin/acli`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note cleanup and create-project removal"
```

Do not push or open a PR. Report to the user and wait.

---

### Task 6: Serbian FAQ (on `fe/docs`)

**Files:**
- Modify: `docs/sr/faq.md:69-71` (exists only on `fe/docs`, uncommitted)

- [ ] **Step 1: Switch to the original working tree**

Run: `cd /Users/aleksandar/Desktop/Aleksandar/Projekti/project-setup && git branch --show-current`
Expected: `fe/docs`.

- [ ] **Step 2: Delete the section**

In `docs/sr/faq.md`, delete the whole section, including its heading and the blank line before it:

```md
## Prelazak sa `create-project` {#coming-from-create-project}

Stara komanda `create-project` i dalje radi: ispiše upozorenje o zastarelosti i prosledi na `acli create`. Njena staging konvencija (Docker kontejner pronađen po imenu, `STAGING_SSH_HOST`) više nije podržana — napravi [SSH profil](./guide/profiles) za server sa wp-cli-jem, ili Coolify profil.
```

Also delete the same English section from `docs/faq.md` in this working tree, using exactly the text from Task 2 Step 6, so `fe/docs` and `chore/cleanup` agree and don't conflict when both merge.

- [ ] **Step 3: Check for dangling links**

Run: `grep -rn "coming-from-create-project\|create-project" docs --include=*.md --include=*.vue --include=*.ts --include=*.mjs --exclude-dir=node_modules --exclude-dir=superpowers | grep -v "composer create-project"`
Expected: no output.

- [ ] **Step 4: Leave it uncommitted**

These edits belong with the rest of the uncommitted `fe/docs` work. Don't commit them on their own. Mention them to the user.

---

### Task 7: Keep internal plans out of the docs site (on `fe/docs`)

**Files:**
- Modify: `docs/.vitepress/config.mjs` (the top-level `export default {` object, around line 112; uncommitted on `fe/docs`)

**Why:** VitePress turns every `.md` under `docs/` into a public page on GitHub Pages. This plan (`docs/superpowers/plans/…`) and any future ones would be published.

- [ ] **Step 1: Prove the problem**

Run: `npm run docs:build && find docs/.vitepress/dist -path '*superpowers*' | head`
Expected: at least one hit, for example `docs/.vitepress/dist/superpowers/plans/2026-10-06-dead-code-cleanup.html`.

- [ ] **Step 2: Add `srcExclude`**

In `docs/.vitepress/config.mjs`, in the top-level config object, add the line right after `lastUpdated: true,`:

```js
export default {
  title: "A-CLI",
  base: "/acli-toolkit/",
  lastUpdated: true,
  // Internal working notes (implementation plans) live next to the docs but are not pages.
  srcExclude: ["superpowers/**"],
```

- [ ] **Step 3: Verify**

Run: `rm -rf docs/.vitepress/dist && npm run docs:build && find docs/.vitepress/dist -path '*superpowers*' | head`
Expected: the build succeeds (no dead-link errors), and `find` prints nothing.

- [ ] **Step 4: Leave it uncommitted**

Like Task 6, this goes in with the rest of the `fe/docs` work.

---

## Out of scope (deliberately)

- **Tightening `ProjectPlan` into a discriminated union** and removing the remaining ~57 `any`s. That is a bigger refactor touching prompts, strategies and the import workflow, and it deserves its own plan. Task 1 removes only the one cast that needed no type changes.
