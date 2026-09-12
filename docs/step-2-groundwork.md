# Step 2: Groundwork

> **Snapshot from step 2.** Step 3 replaced the UI layer described here
> (`src/ui/app.ts` became a Preact app over a store in `src/store/`) and moved
> all persistence policy out of the UI. The domain, schema and repository
> described here are still current. See [`README.md`](README.md).


Implementation guide for `personal-gtd`, step 2 of the refactoring plan. It follows [`step-1-data-safety.md`](step-1-data-safety.md) and assumes that step is applied. If you skipped step 1, this still works: the stored data format it migrates from is the same.

**What this step is for.** Step 1 made the app *safe*. Step 2 makes it *changeable*. Every feature on the roadmap (projects, contexts as records, defer dates, the weekly review, sync) means changing the data model and adding rules. Today the rules live in button-rendering code, the data has no version, and nothing is tested, so each of those features would be surgery on `app.ts` with no safety net. After this step:

- **The GTD rules are data and pure functions, in one place, with tests.** A new rule is a table entry plus a test, not a UI change.
- **Stored data has a version, and every read goes through migrations.** You can change the model without breaking existing data or backups, and an older build refuses to overwrite data it doesn't understand.
- **Deletions are data (tombstones).** That's the precondition for correct merging, for imports that don't bring deleted items back, and for any future sync.
- **The layering is enforced by a test,** so the structure doesn't quietly erode.

**What it deliberately doesn't do:**

- no new features
- no UI framework
- no async storage

Section 2.6 explains the last one.

**How to use this document.** Work through it in order. Each section is one commit and says what to change, why, and how to check it. The appendix has every file in full. It was type-checked, unit-tested (47 tests) and exercised in Chromium; see *Verification status*.

---

## 0. Principles

Step 1's four rules still apply. Four more are added:

1. **Rules are data.** Which list an item can move to is a table, not a `switch` inside a render function. Data can be tested exhaustively, and the UI can be generated from it.
2. **The domain is pure.** Domain functions take everything they need as arguments, including *the current time and new ids*, and return new values. No `Date.now()`, no `crypto`, no `localStorage` inside. That makes every rule testable with plain inputs and outputs, and portable to any UI or storage layer later.
3. **Expected failures are return values; bugs are exceptions.** "The item was deleted in another tab" is something a user can cause, so it's an `OpResult` the UI explains. A failure a user can't cause is a bug and may throw.
4. **Never write what you can't read.** If stored data comes from a *newer* schema than this build knows, go read-only. That's step 1's "never overwrite what you couldn't read", extended across versions.

## End state

```text
src/
  domain/                 pure TypeScript, no browser APIs (enforced)
    model.ts              Item (schema v2), Status, isItem, isLive
    ids.ts                newId (moved from gtd.ts)
    capture.ts            parseCapture, createItem(input, id, now)
    transitions.ts        TRANSITIONS table, canTransition, transition
    operations.ts         capture / move / remove / restore / purgeTombstones → OpResult
    queries.ts            liveItems, itemsInStatus
    merge.ts              tombstone-aware mergeItems
    test-helpers.ts       makeItem() for tests
    *.test.ts
  persistence/            may use domain; knows about storage formats
    schema.ts             SCHEMA_VERSION, migrations, migrate()
    repository.ts         Repository interface + localStorage implementation
    backup.ts             backup file format v2 (reads v1)
    fixtures/v1-sample.json
    *.test.ts
  ui/                     may use everything
    app.ts                orchestration + rendering (was src/lib/app.ts)
    download.ts
  architecture.test.ts    enforces the layering
  pages/index.astro       script path → ../ui/app.ts
src/lib/                  DELETED (gtd.ts, storage.ts, backup.ts, app.ts)
package.json, tsconfig.json, Dockerfile   EDIT
```

**Suggested commit sequence:**

1. 2.1 tooling
2. 2.2 domain, with tests
3. 2.3 + 2.4 + 2.5 persistence, with tests
4. 2.7 app switch-over, deleting `src/lib/`
5. 2.8 architecture test

Commits 1–3 only *add* code, so the app keeps running unchanged until commit 4 switches it over.

---

## 2.1 Tooling: type-check, tests, one verify command

**Problem.** Nothing checks types: `astro build` doesn't type-check, so `strict` in `tsconfig.json` is decorative. There are no tests. The Docker image is built from whatever compiles.

**Decisions and why:**

- **Tests run on Node's built-in test runner (`node:test`), not Vitest.** The code under test is pure TypeScript with no DOM and no bundler features, and Node 22.18+ runs `.ts` files directly by stripping types. That means zero test dependencies and no version-compatibility risk with Astro 7, Vite or TypeScript 7. The cost: a more basic reporter, and imports must spell out `.ts`. If you later want DOM component tests, Vitest can be added for those alone.
- **Imports use explicit `.ts` extensions** (`from './model.ts'`). Node requires real file names, and Vite and Astro accept them. The `allowImportingTsExtensions` compiler option makes `tsc` accept them too.
- **`erasableSyntaxOnly`** makes `tsc` reject the few TypeScript constructs that type stripping can't handle (enums, namespaces, constructor parameter properties). Without it, a stray `enum` would type-check and then crash the test run.
- **`typecheck` runs `astro sync` first**, which generates Astro's type declarations. On a fresh checkout (CI, Docker) they don't exist yet.
- **One `verify` command** (typecheck → test → build) that you, CI and Docker all run. One definition of "green".
- **Docker runs `verify`**, so a failing test can never become an image.

**Do this:**

1. Install the Node type definitions: `npm install -D @types/node@24`. This pins them to the Node major version used in Docker.
2. Replace the contents of `package.json`, `tsconfig.json` and the `Dockerfile` with the versions in the appendix.

**Optional CI** (`.github/workflows/verify.yml`, if the repo is on GitHub):

```yaml
name: verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run verify
```

**Check.** `npm run typecheck` passes. `npm test` finds 0 tests for now, which is fine. If `tsc` from TypeScript 7 rejects one of the compiler options, see *Verification status*.

---

## 2.2 The domain layer

Everything here is pure: arguments in, new values out. Each file comes with tests.

### `model.ts`: schema v2

Two optional fields are added to `Item`:

| Field | Meaning | Why now |
|---|---|---|
| `completedAt` | When it was done. Set if and only if `status === 'done'`. | Step 1 used `updatedAt` as the completion time, but that changes on every edit. The weekly review ("what did I finish this week?") and sorting the Done list need the real moment. |
| `deletedAt` | Makes the item a *tombstone*: kept in storage, hidden everywhere. | A hard delete is invisible to a merge, so an old backup brings deleted items back (a step 1 known limitation). A tombstone is a newer version of the item that says "gone", and the merge rule "newer wins" handles it with no special case. Every future sync approach needs this. |

`updatedAt` is now bumped on **every** change, including delete and restore, because merging relies on it.

`isItem` gains one *invariant* check: `completedAt` exists if and only if the item is done. Invariants in the validator mean corrupted or hand-edited data can't produce impossible states downstream.

### `ids.ts` and `capture.ts`

`newId` moves unchanged. `createItem(input, id, now)` now *receives* its id and time instead of calling `crypto` and `Date.now()` (principle 2). The test can then assert the exact object, and the domain stays runnable anywhere.

### `transitions.ts`: the workflow as a table

```ts
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  inbox:   ['next', 'waiting', 'someday'],
  next:    ['done', 'someday', 'inbox'],
  waiting: ['done', 'someday', 'inbox'],
  someday: ['next', 'inbox'],
  done:    ['next'],
};
```

This is `actionButtons()` from `app.ts` with the labels removed. Labels are presentation and stay in the UI (`moveLabel()`). Which moves exist is a domain rule. Because it's data, the tests can check properties of the *whole workflow* rather than individual cases:

- every status can eventually reach `done`
- `inbox` can't jump straight to `done` (GTD: clarify first)
- no status transitions to itself
- every allowed move produces a valid item, with the `completedAt` invariant kept

When projects arrive, adding a state is one table line, and those property tests immediately tell you whether the workflow still makes sense.

`transition(item, to, now)` builds the moved item and maintains `completedAt`: it's set when entering `done` and removed when leaving it.

### `operations.ts`: every change, as a pure function with a result

```ts
type OpResult = { ok: true; items: Item[] } | { ok: false; reason: OpFailure };
type OpFailure = 'empty-input' | 'not-found' | 'not-allowed' | 'deleted' | 'not-deleted';
```

These are `capture`, `move`, `remove` (makes a tombstone), `restore` (undo) and `purgeTombstones`.

*Why return failures instead of throwing:* step 1's re-read-before-write means an action can meet data another tab just changed. Say tab A shows an item in the Inbox, tab B moves it to Done, and you click "→ Someday" in tab A: after the re-read, that move isn't allowed any more. That's a normal event, not a bug, so it's a value the UI turns into a sentence ("That item was moved in another tab"). A thrown exception would be an unhandled error.

**Tombstone retention.** Tombstones older than 90 days are purged when the app starts, so storage doesn't grow forever. The trade-off: a backup older than 90 days can bring back items deleted more than 90 days ago. 90 days covers any realistic "restore last month's backup" case. Tune `TOMBSTONE_RETENTION_MS` if you disagree.

### `queries.ts`

`liveItems` and `itemsInStatus` (which excludes tombstones and sorts; Done by `completedAt`). Views are queries over all items. That's the pattern the future "next actions by context" and "stalled projects" views will follow.

### `merge.ts`: tombstone-aware

The merge rule is the same as in step 1 (newer `updatedAt` wins, ties keep the current copy). Tombstones make it correct for deletions without any extra logic:

| Current | Incoming | Result |
|---|---|---|
| tombstone (t=20) | live copy (t=10, old backup) | stays deleted: no resurrection |
| live (t=10) | tombstone (t=20) | deleted, counted as `deleted` |
| tombstone (t=20) | restored copy (t=30) | restored |

Tests cover all three, plus idempotence and "newer wins in both directions".

**Check.** `npm test` runs the domain tests (appendix) and they pass.

---

## 2.3 Schema versioning and migrations

**Problem.** Stored data is a bare array with no version. The first model change leaves you guessing which format you're reading.

**Format:**

| Version | Key | Shape |
|---|---|---|
| v1 (steps 0–1) | `gtd:items` | `Item[]` |
| v2 (this step) | `gtd:data` | `{ schemaVersion: 2, items: Item[] }` |

**Why a new key instead of rewriting `gtd:items`:**

- **Rollback safety.** `gtd:items` is read once for migration and then never written again. If you redeploy the step 1 build, it still finds its data (as of the migration moment) instead of an envelope it would treat as corrupt.
- **Stale tabs.** A tab still running step 1 code keeps writing `gtd:items`, and v2 ignores it. The alternative is that tab treating the new envelope as corrupt data and quarantining it. After deploying, reload any open tabs (see *Known limitations*).
- **The legacy copy is a free backup of the pre-migration state.** Delete it by hand once you're confident: `localStorage.removeItem('gtd:items')`.

**How `migrate()` works:**

1. `detectVersion`: an array is v1; an object with an integer `schemaVersion ≥ 2` is that version; anything else is corrupt.
2. Newer than `SCHEMA_VERSION` → `{ kind: 'newer' }`. The app goes read-only (principle 4). Guessing at a newer format and writing it back is how data gets destroyed on a rollback.
3. Apply `MIGRATIONS[v]` for each version up to the current one.
4. **One gate at the end:** the result must have an `items` array, and every item passes `isItem`. Invalid items are counted, as in step 1.

**Migrations take `unknown`, deliberately.** Old data is untrusted input. A migration reshapes what it recognises and passes everything else through; the single validation at the end decides. That's simpler and safer than typing each historical version.

**The v1 → v2 migration** wraps the array in the envelope and backfills `completedAt = updatedAt` for done items. That's the best available estimate, and it's what the app already showed.

**Rules for future migrations** (put them in a comment, as the appendix does):

- A migration that has shipped is **never edited**, only followed by a new one. Someone's browser or backup file may be at any version.
- Each migration gets a **fixture**: a real sample of the old format in `fixtures/`, plus a test for the exact result. Fixtures are frozen snapshots of history, which is why they're files and not generated in the test.
- Migration must be **idempotent**: migrating current data changes nothing (tested).
- **Adding an optional field needs no bump.** A version bump makes older builds
  treat the data as unreadable (principle 4), so it costs every tab that has not
  reloaded. It works because operations copy items with a spread, so fields an
  older build does not know survive a round trip. Bump only when existing data
  must actually be transformed.

**Pre-migration copy.** When a future version (v2 → v3) migrates data under `gtd:data` itself, the app first stashes the raw value at `gtd:pre-migration:v2:<timestamp>`. If that stash fails, it pauses saving and offers a download, exactly like step 1's quarantine. For v1 → v2 this isn't needed, because the legacy key already *is* the copy.

---

## 2.4 The repository

**Problem.** Step 1's `storage.ts` is a set of functions hard-wired to `window.localStorage`. That's fine for the app, but not testable in Node, and it's not a seam you can swap later.

**Design:**

```ts
interface Repository {
  load(): LoadResult;                              // pure read, never throws
  save(items: Item[]): WriteResult;                // never throws
  stash(prefix: string, raw: string): string | null;
  subscribe(callback: () => void): () => void;     // changes from other tabs
}
```

`LoadResult` extends step 1's result with:

- `newer`: data from a newer schema
- on `ok`: `from` (the stored version) and `source` (`gtd:data` or the legacy key), so the app knows whether it's looking at migrated data and whether that data is already safe elsewhere

`createLocalStorageRepository(getStore, events)` takes the storage and the event target as parameters, defaulting to `window.localStorage` and `window`. The tests pass an in-memory `MemoryStore` and `null`, so the full load/migrate/save path runs in Node, including legacy migration, "current beats legacy", quota errors and blocked storage. *Why a function returning the store (`getStore`) rather than the store itself:* in some browsers even *accessing* `window.localStorage` throws. Deferring the access keeps that inside the method's `try`.

**Why an interface at all, with only one implementation?** It's the seam for the storage change in step 3+ (IndexedDB, then possibly sync). It costs one type declaration now. Without it, every call site would need changing later.

---

## 2.5 Backup format v2

A backup file is now **an envelope around a stored document**:

```json
{ "format": "personal-gtd-backup", "version": 2, "exportedAt": "…",
  "data": { "schemaVersion": 2, "items": [ … ] } }
```

*Why:* the payload is exactly what storage holds, so backups go through **the same migrations** as storage, forever. You never maintain a second upgrade path for files. The envelope `version` only changes if the envelope itself changes.

`parseBackup` accepts:

- v2 files
- **step 1 files (v1)**: their `items` array is by definition a v1 document, so it's simply migrated
- bare arrays (a raw step 1 value or a quarantined copy)
- raw v2 storage values

Files from a newer app version are refused with a clear message.

Exports **include tombstones.** Importing a backup in another browser then also carries over what you deleted. That's the first small step towards sync semantics.

---

## 2.6 Why the repository stays synchronous (for now)

IndexedDB, which you'll want once notes and larger volumes arrive, is *asynchronous*. Making `Repository` async now looks like good foresight, but it would make `commit()` (re-read, apply, save) span several `await`s. Two clicks could then interleave, and step 1's re-read-before-write guarantee would quietly break. Making async correct requires queueing commands one at a time, and that queue is exactly the store with `dispatch` planned for step 3.

So the order is: step 3 introduces the command queue and store, *then* the repository becomes async behind it. Doing it in that order means async arrives together with the thing that makes it safe.

---

## 2.7 Switching the app over

`src/lib/app.ts` moves to `src/ui/app.ts` and becomes orchestration only:

- **`commit(operation)`** keeps step 1's shape (re-read → apply → save → render), but the operation is now a domain function returning `OpResult`. On failure nothing is saved and a toast explains why (`FAILURE_MESSAGES`, one sentence per `OpFailure`). Mapping every failure reason to a message is a `Record<OpFailure, string>`, so adding a failure reason without a message is a type error.
- **`refreshFromStorage()`** is shared by `commit` and the cross-tab listener, with the same guards as step 1 (`canWrite`, `unsaved`, no invalid items). It also only adopts data at the current schema version.
- **Rendering** loops over `STATUSES`, gets its buttons from `TRANSITIONS[item.status]` and labels them with `moveLabel()`. `actionButtons()` is gone.
- **Delete** calls `remove` (tombstone), and **Undo** calls `restore`. Because the tombstone is stored, Undo still works if another tab saved in the meantime. Step 1's undo re-inserted a copy held in memory.
- **Boot** handles the new cases:

| Load result | Behaviour |
|---|---|
| `ok` from legacy key (v1) | Migrate in memory, save to `gtd:data`. Legacy key untouched. No banner: this is the normal upgrade. |
| `ok` from `gtd:data`, older version (future) | Stash pre-migration copy first, then save. If the stash fails → paused mode. |
| `ok` with invalid items | As step 1: quarantine copy + banner. |
| `ok` (any) | Purge old tombstones; save if anything changed. |
| `corrupt` in legacy key | Banner + download. No quarantine needed: the legacy key is never written. |
| `corrupt` in `gtd:data` | As step 1: quarantine, or paused mode. |
| `newer` | Read-only. Banner explains; `beforeunload` guards in-memory captures. |
| `unavailable` | As step 1. |

- **Import** reports deletions too, in the confirmation dialog and the result toast.
- The *last export* timestamp and `requestPersistence()` move into `app.ts`. They're UI concerns, not domain or storage formats.

**Do this.**

1. Create `src/ui/app.ts` and `src/ui/download.ts` from the appendix.
2. In `index.astro`, change the script tag:

```diff
-    <script src="../lib/app.ts"></script>
+    <script src="../ui/app.ts"></script>
```

3. Delete `src/lib/`. The CSS is unchanged from step 1.

---

## 2.8 Architecture test

`src/architecture.test.ts` reads the source files and fails if:

- a `domain/` file imports anything outside `domain/`, or uses `window`, `document`, `localStorage`, `sessionStorage` or `navigator`
- a `persistence/` file imports from `ui/`, or uses `document` or `navigator`
- either layer imports an npm package (node built-ins are allowed in tests only)

*Why a test and not just a convention:* layering erodes one "just this once" import at a time, and nobody notices until the domain can't be tested without a browser. A 40-line test turns that into a red build. It's deliberately simple (regex over import lines). A lint rule such as `eslint-plugin-boundaries` would be the heavier alternative if you add ESLint later.

---

## 3. Tests

`npm test` runs 47 tests in about 1.5 s. `npm run test:watch` reruns them on save.

| File | What it pins down |
|---|---|
| `capture.test.ts` | the 7 parser cases from step 1; *no captured text is ever dropped* (checked over all cases); `createItem` output |
| `model.test.ts` | `isItem` accepts tombstones and rejects bad shapes; the `completedAt` invariant; the `newId` fallback without `randomUUID` |
| `transitions.test.ts` | whole-workflow properties (see 2.2); every move keeps items valid |
| `operations.test.ts` | allowed and refused moves; input never mutated (tested with frozen objects); tombstone and restore; purge retention; Done ordering |
| `merge.test.ts` | adds; idempotence; newer wins both ways; ties; no resurrection; deletions propagate; restore beats deletion |
| `schema.test.ts` | version detection; **v1 fixture → v2**; pass-through; idempotence; newer refused; corrupt shapes |
| `repository.test.ts` | legacy migration never writes the legacy key; current beats legacy; corrupt / newer / unavailable / quota returned, never thrown; stash |
| `backup.test.ts` | v2 round trip including tombstones; v1 files migrated; bare arrays; newer, foreign and damaged files refused |
| `architecture.test.ts` | the layering (2.8) |

**Manual browser checks** (most behaviour is now unit-tested, so these cover the wiring). Run them in the console.

**M1: Upgrade from step 1.**

```js
localStorage.clear();
localStorage.setItem('gtd:items', JSON.stringify([{id:'a',title:'Old task',status:'done',createdAt:1,updatedAt:3000}]));
location.reload()
```

✅ "Old task" is in Done, with no banner. `JSON.parse(localStorage.getItem('gtd:data'))` shows `schemaVersion: 2` and `completedAt: 3000`, and `gtd:items` is unchanged.

**M2: Tombstone.** Delete an item. ✅ It's still in `gtd:data` with `deletedAt`, and after a reload it's still hidden. Delete another item and click Undo. ✅ It's back, and `deletedAt` is gone.

**M3: Stale tab.** Open two tabs. In tab A, run `window.__b = document.querySelector('.item-actions button')`. In tab B, delete that item. In tab A, run `__b.click()`. ✅ Toast: *"That item was deleted in another tab."* Nothing is written.

**M4: Newer version.**

```js
localStorage.setItem('gtd:data', JSON.stringify({schemaVersion: 99, items: []})); location.reload()
```

✅ Read-only banner. After a capture, `gtd:data` still says 99.

**M5: Imports.**

1. Import a step 1 backup file. ✅ It's migrated.
2. Export, delete an item, then import the export. ✅ The deleted item stays deleted.
3. Import a file whose tombstone is newer than your live copy. ✅ The dialog says 1 will be deleted.

**M6: Purge.** Store a tombstone with `deletedAt` 100 days ago and reload. ✅ It's gone from storage.

**M7: Docker.** `docker build --no-cache .` runs the type-check and tests during the build. Break a test on purpose and ✅ the build fails.

---

## 4. Known limitations (for step 3 and later)

- **Reload open tabs after deploying.** A tab still running step 1 code writes to `gtd:items`, which v2 ignores. Captures made there after the upgrade won't show up in v2. Fix it by exporting from the old tab and importing into the new one; merge makes that safe.
- **Still whole-list writes and a synchronous repository.** This is the step 1 limitation around failed saves plus concurrent tabs, and 2.6 explains why it stays. → Step 3: command queue, then an async repository (IndexedDB).
- **The UI is still hand-built DOM with full re-renders** (open/closed sections reset on each action). → Step 3.
- **`app.ts` isn't unit-tested.** It's now thin enough that the logic worth testing lives in domain and persistence. Component tests come with the UI choice in step 3.
- **Contexts are still a single free-text string per item.** → Step 4: contexts and projects as records, with `contextIds[]` and `projectId`. That will be the first real use of the migration mechanism (v2 → v3), with fixtures from day one.
- **Tombstones older than 90 days are purged,** so a very old backup can bring back items deleted long ago (2.2).

---

## 5. Verification status

- **Type-check:** passes, with `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `allowImportingTsExtensions` and `erasableSyntaxOnly`, plus DOM and Node types. This was run with TypeScript 6.0.
- **Tests:** all 47 pass on Node 22.22 with native type stripping, exactly as `npm test` runs them.
- **Browser (headless Chromium), against a bundle of `src/ui/app.ts`:**
  - migration from step 1 storage, with the legacy key untouched
  - delete → tombstone → undo
  - stale-tab refusal with the toast
  - newer-schema read-only mode, with storage untouched
  - tombstone purge on boot
  - quarantine of corrupt `gtd:data`
  - importing a v1 file, and a v2 file with a newer tombstone (counted as deleted)
  - export in v2 format including tombstones

**Not verified, so check these once:**

- **`astro build`, `astro sync` and the Docker build.** Package downloads from npm were blocked in the sandbox.
- **TypeScript 7.** Your project uses TypeScript 7 and I checked with 6.0. All the compiler options used here exist in 5.8+. If the TS 7 `tsc` rejects one, remove it: the code doesn't depend on any of them at runtime.
- **Node on your machine.** Check that `node --version` is at least 22.18. That's the first version that runs `.ts` tests without flags. Docker already uses Node 24.

---

## Appendix: complete files

### `package.json`

```json
{
  "name": "personal-gtd",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.18"
  },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "typecheck": "astro sync && tsc --noEmit",
    "test": "node --test \"src/**/*.test.ts\"",
    "test:watch": "node --test --watch \"src/**/*.test.ts\"",
    "verify": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "astro": "^7.1.6"
  },
  "devDependencies": {
    "@types/node": "^24",
    "typescript": "^7.0"
  }
}
```

### `tsconfig.json`

```jsonc
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    // Imports carry explicit .ts extensions so Node can run tests without a bundler.
    "allowImportingTsExtensions": true,
    "noEmit": true,
    // Forbid syntax Node's type stripping can't erase (enums, namespaces, parameter properties).
    "erasableSyntaxOnly": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### `Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Type-check, run the tests, then build: a broken build never becomes an image.
RUN npm run verify

# Stage 2: Production (unprivileged nginx for Kubernetes/OpenShift)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8000
CMD ["nginx", "-g", "daemon off;"]
```

### `src/domain/model.ts`

```ts
export type Status = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export const STATUSES: readonly Status[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

/**
 * Schema version 2.
 * - completedAt: set exactly when status === 'done'.
 * - deletedAt:   set on a tombstone. Tombstones stay in storage (so deletions
 *                survive merges and imports) but are hidden from every view.
 * - updatedAt:   bumped on EVERY change, including delete and restore; merge
 *                relies on it to decide which copy is newer.
 */
export interface Item {
  id: string;
  title: string;
  context?: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  deletedAt?: number;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Runtime check for data we did not produce in this session (storage, imports). */
export function isItem(value: unknown): value is Item {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      typeof v.id === 'string' &&
      v.id.length > 0 &&
      typeof v.title === 'string' &&
      (v.context === undefined || typeof v.context === 'string') &&
      typeof v.status === 'string' &&
      (STATUSES as readonly string[]).includes(v.status) &&
      isTimestamp(v.createdAt) &&
      isTimestamp(v.updatedAt) &&
      (v.completedAt === undefined || isTimestamp(v.completedAt)) &&
      (v.deletedAt === undefined || isTimestamp(v.deletedAt))
    )
  ) {
    return false;
  }
  // Invariant: completedAt exists if and only if the item is done.
  return (v.status === 'done') === (v.completedAt !== undefined);
}

export function isLive(item: Item): boolean {
  return item.deletedAt === undefined;
}
```

### `src/domain/ids.ts`

```ts
/**
 * RFC 4122 v4 UUID. crypto.randomUUID() only exists in secure contexts
 * (HTTPS / localhost); crypto.getRandomValues() works everywhere.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

### `src/domain/capture.ts`

```ts
import type { Item } from './model.ts';

// A context is a trailing "@word" that starts the string or follows whitespace,
// so "jan@minbzk.nl" is never split.
const TRAILING_CONTEXT = /^(.*?)(?:^|\s)@(\S+)\s*$/;

export interface ParsedCapture {
  title: string;
  context?: string;
}

/**
 * "Buy milk @errands" -> { title: "Buy milk", context: "errands" }
 * Rule: never drop captured text. If stripping the context would leave an
 * empty title, the whole input becomes the title.
 */
export function parseCapture(input: string): ParsedCapture {
  const trimmed = input.trim();
  const match = trimmed.match(TRAILING_CONTEXT);
  if (match && match[1].trim() !== '') {
    return { title: match[1].trim(), context: match[2] };
  }
  return { title: trimmed };
}

/** Pure: the caller supplies the id and the clock. */
export function createItem(input: string, id: string, now: number): Item {
  const { title, context } = parseCapture(input);
  const item: Item = { id, title, status: 'inbox', createdAt: now, updatedAt: now };
  if (context !== undefined) item.context = context;
  return item;
}
```

### `src/domain/transitions.ts`

```ts
import type { Item, Status } from './model.ts';

/**
 * The GTD workflow as data: which lists an item may move to from each list.
 * The UI renders buttons from this table; it never decides the rules itself.
 */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  inbox: ['next', 'waiting', 'someday'],
  next: ['done', 'someday', 'inbox'],
  waiting: ['done', 'someday', 'inbox'],
  someday: ['next', 'inbox'],
  done: ['next'],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Returns the moved item. Maintains the completedAt invariant.
 * Precondition: canTransition(item.status, to). Callers go through
 * operations.move(), which checks it.
 */
export function transition(item: Item, to: Status, now: number): Item {
  const { completedAt: _dropped, ...rest } = item;
  const moved: Item = { ...rest, status: to, updatedAt: now };
  if (to === 'done') moved.completedAt = now;
  return moved;
}
```

### `src/domain/operations.ts`

```ts
import { createItem } from './capture.ts';
import { isLive, type Item, type Status } from './model.ts';
import { canTransition, transition } from './transitions.ts';

/**
 * Every change to the list is one of these pure functions. They never throw
 * for conditions a user can cause (e.g. acting on an item another tab just
 * changed): they return a failure the UI can explain.
 */
export type OpFailure = 'empty-input' | 'not-found' | 'not-allowed' | 'deleted' | 'not-deleted';
export type OpResult = { ok: true; items: Item[] } | { ok: false; reason: OpFailure };

function replace(items: Item[], updated: Item): Item[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

export function capture(items: Item[], input: string, id: string, now: number): OpResult {
  if (input.trim() === '') return { ok: false, reason: 'empty-input' };
  return { ok: true, items: [...items, createItem(input, id, now)] };
}

export function move(items: Item[], id: string, to: Status, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  if (!canTransition(item.status, to)) return { ok: false, reason: 'not-allowed' };
  return { ok: true, items: replace(items, transition(item, to, now)) };
}

/** Soft delete: the item becomes a tombstone. */
export function remove(items: Item[], id: string, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (!isLive(item)) return { ok: false, reason: 'deleted' };
  return { ok: true, items: replace(items, { ...item, deletedAt: now, updatedAt: now }) };
}

export function restore(items: Item[], id: string, now: number): OpResult {
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'not-found' };
  if (isLive(item)) return { ok: false, reason: 'not-deleted' };
  const { deletedAt: _dropped, ...rest } = item;
  return { ok: true, items: replace(items, { ...rest, updatedAt: now }) };
}

export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Drop tombstones older than the retention period. */
export function purgeTombstones(items: Item[], now: number, retentionMs = TOMBSTONE_RETENTION_MS): Item[] {
  return items.filter((item) => item.deletedAt === undefined || now - item.deletedAt < retentionMs);
}
```

### `src/domain/queries.ts`

```ts
import { isLive, type Item, type Status } from './model.ts';

export function liveItems(items: Item[]): Item[] {
  return items.filter(isLive);
}

/** Items shown in one list, newest first. Done is ordered by completion. */
export function itemsInStatus(items: Item[], status: Status): Item[] {
  const key = (item: Item) => (status === 'done' ? (item.completedAt ?? item.updatedAt) : item.updatedAt);
  return items.filter((item) => isLive(item) && item.status === status).sort((a, b) => key(b) - key(a));
}
```

### `src/domain/merge.ts`

```ts
import type { Item } from './model.ts';

export interface MergeResult {
  items: Item[];
  added: number;
  updated: number;
  deleted: number;
}

/**
 * Merge by id; for an id present on both sides the copy with the newer
 * updatedAt wins (ties keep `current`). Because deletions are tombstones with
 * a bumped updatedAt, they win over older live copies too, so importing an old
 * backup cannot resurrect something deleted since.
 *
 * Properties (see merge.test.ts): idempotent, never loses the newer copy.
 */
export function mergeItems(current: Item[], incoming: Item[]): MergeResult {
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      if (item.deletedAt === undefined) added++;
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
      if (item.deletedAt !== undefined && existing.deletedAt === undefined) deleted++;
      else updated++;
    }
  }
  return { items: [...byId.values()], added, updated, deleted };
}
```

### `src/persistence/schema.ts`

```ts
import { isItem, type Item } from '../domain/model.ts';

/**
 * Stored document format.
 *   v1 (step 0/1): a bare array of items under "gtd:items".
 *   v2 (step 2):   { schemaVersion: 2, items } under "gtd:data";
 *                  items gain completedAt and deletedAt.
 */
export const SCHEMA_VERSION = 2;

export interface StoredDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  items: Item[];
}

/**
 * MIGRATIONS[n] upgrades a version-n document to version n+1.
 * They take `unknown` on purpose: old data is untrusted input. They reshape
 * what they recognise and pass everything else through untouched; the single
 * isItem() check at the end of migrate() is the gate.
 *
 * Rules: a migration that has shipped is never edited, only followed by a new
 * one. Each gets a fixture test.
 */
const MIGRATIONS: Record<number, (doc: unknown) => unknown> = {
  1: (doc) => ({
    schemaVersion: 2,
    items: (doc as unknown[]).map((raw) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const item = raw as Record<string, unknown>;
      // Best available completion time for items finished before v2.
      if (item.status === 'done' && item.completedAt === undefined) {
        return { ...item, completedAt: item.updatedAt };
      }
      return item;
    }),
  }),
};

export function detectVersion(data: unknown): number | null {
  if (Array.isArray(data)) return 1;
  if (typeof data === 'object' && data !== null) {
    const version = (data as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version >= 2) return version;
  }
  return null;
}

export type MigrateResult =
  | { kind: 'ok'; doc: StoredDoc; from: number; invalid: number }
  | { kind: 'corrupt' }
  | { kind: 'newer'; version: number };

export function migrate(data: unknown): MigrateResult {
  const from = detectVersion(data);
  if (from === null) return { kind: 'corrupt' };
  if (from > SCHEMA_VERSION) return { kind: 'newer', version: from };

  let doc = data;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { kind: 'corrupt' };
    doc = step(doc);
  }

  const rawItems = (doc as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return { kind: 'corrupt' };
  const items = rawItems.filter(isItem);
  return { kind: 'ok', doc: { schemaVersion: SCHEMA_VERSION, items }, from, invalid: rawItems.length - items.length };
}
```

### `src/persistence/repository.ts`

```ts
import type { Item } from '../domain/model.ts';
import { migrate, SCHEMA_VERSION, type StoredDoc } from './schema.ts';

export const DATA_KEY = 'gtd:data';
/** Step 0/1 storage. Read once for migration, then left untouched as a rollback copy. */
export const LEGACY_KEY = 'gtd:items';

export type LoadResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      items: Item[];
      invalid: number;
      raw: string;
      /** Version the data was stored in; < SCHEMA_VERSION means it was migrated in memory. */
      from: number;
      source: typeof DATA_KEY | typeof LEGACY_KEY;
    }
  | { kind: 'corrupt'; raw: string; source: typeof DATA_KEY | typeof LEGACY_KEY }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable'; error: unknown };

export type WriteResult = { ok: true } | { ok: false; error: unknown };

/**
 * The seam between the app and where data lives. Today: localStorage.
 * Later: IndexedDB or a sync backend, behind the same interface
 * (which will then become async; see the step 2 guide, section 2.6).
 */
export interface Repository {
  /** Pure read: never writes, never throws. */
  load(): LoadResult;
  /** Never throws. */
  save(items: Item[]): WriteResult;
  /** Copy a raw value aside under `<prefix><timestamp>`. Returns the key, or null. */
  stash(prefix: string, raw: string): string | null;
  /** Called when ANOTHER tab changes the data. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;
}

/** The subset of the Web Storage API we use; lets tests pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parse(raw: string, source: typeof DATA_KEY | typeof LEGACY_KEY): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw, source };
  }
  const result = migrate(data);
  switch (result.kind) {
    case 'ok':
      return { kind: 'ok', items: result.doc.items, invalid: result.invalid, raw, from: result.from, source };
    case 'newer':
      return { kind: 'newer', version: result.version };
    case 'corrupt':
      return { kind: 'corrupt', raw, source };
  }
}

export function createLocalStorageRepository(
  getStore: () => KeyValueStore = () => window.localStorage,
  events: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): Repository {
  return {
    load() {
      let raw: string | null;
      let legacy: string | null = null;
      try {
        const store = getStore();
        raw = store.getItem(DATA_KEY);
        if (raw === null) legacy = store.getItem(LEGACY_KEY);
      } catch (error) {
        return { kind: 'unavailable', error };
      }
      if (raw !== null) return parse(raw, DATA_KEY);
      if (legacy !== null) return parse(legacy, LEGACY_KEY);
      return { kind: 'empty' };
    },

    save(items) {
      const doc: StoredDoc = { schemaVersion: SCHEMA_VERSION, items };
      try {
        getStore().setItem(DATA_KEY, JSON.stringify(doc));
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    },

    stash(prefix, raw) {
      const key = `${prefix}${new Date().toISOString()}`;
      try {
        getStore().setItem(key, raw);
        return key;
      } catch {
        return null;
      }
    },

    subscribe(callback) {
      if (!events) return () => {};
      const listener = (event: Event) => {
        const key = (event as StorageEvent).key;
        if (key === DATA_KEY || key === null) callback();
      };
      events.addEventListener('storage', listener);
      return () => events.removeEventListener('storage', listener);
    },
  };
}
```

### `src/persistence/backup.ts`

```ts
import type { Item } from '../domain/model.ts';
import { migrate, SCHEMA_VERSION, type StoredDoc } from './schema.ts';

const FORMAT = 'personal-gtd-backup';

/**
 * Backup file v2 = an envelope around a stored document. Because the payload
 * IS a stored document, backups go through the exact same migrations as
 * storage, forever. The envelope version only changes if the envelope does.
 *
 * v1 (step 1): { format, version: 1, exportedAt, items: <v1 items> }
 * v2 (step 2): { format, version: 2, exportedAt, data: <StoredDoc> }
 */
interface BackupFileV2 {
  format: typeof FORMAT;
  version: 2;
  exportedAt: string;
  data: StoredDoc;
}

/** Includes tombstones, so deletions carry over to wherever the file is imported. */
export function serializeBackup(items: Item[], now = new Date()): string {
  const file: BackupFileV2 = {
    format: FORMAT,
    version: 2,
    exportedAt: now.toISOString(),
    data: { schemaVersion: SCHEMA_VERSION, items },
  };
  return JSON.stringify(file, null, 2);
}

export function backupFilename(now = new Date()): string {
  return `gtd-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseBackupResult = { ok: true; items: Item[]; invalid: number } | { ok: false; error: string };

/**
 * Accepts backup files v1 and v2, and bare arrays (a raw step-1 localStorage
 * value or a quarantined copy), so recovered data can be imported the same way.
 */
export function parseBackup(text: string): ParseBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  let payload: unknown;
  if (Array.isArray(data)) {
    payload = data;
  } else if (typeof data === 'object' && data !== null && (data as { format?: unknown }).format === FORMAT) {
    const file = data as { version?: unknown; items?: unknown; data?: unknown };
    if (file.version === 1) payload = file.items; // v1 items are a v1 document
    else if (file.version === 2) payload = file.data;
    else return { ok: false, error: `This backup was made by a newer version of the app (format ${String(file.version)}).` };
  } else if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    payload = data; // a raw step-2 storage value
  } else {
    return { ok: false, error: 'This does not look like a Personal GTD backup.' };
  }

  const result = migrate(payload);
  switch (result.kind) {
    case 'ok':
      return { ok: true, items: result.doc.items, invalid: result.invalid };
    case 'newer':
      return { ok: false, error: `This backup was made by a newer version of the app (schema ${result.version}).` };
    case 'corrupt':
      return { ok: false, error: 'The backup is damaged: it has no readable item list.' };
  }
}
```

### `src/persistence/fixtures/v1-sample.json`

```json
[
  { "id": "a1", "title": "Buy milk", "context": "errands", "status": "inbox", "createdAt": 1000, "updatedAt": 1000 },
  { "id": "a2", "title": "Call dentist", "status": "next", "createdAt": 1000, "updatedAt": 2000 },
  { "id": "a3", "title": "Renew passport", "status": "done", "createdAt": 1000, "updatedAt": 3000 },
  { "id": "a4", "title": "Broken entry", "status": "archived", "createdAt": 1000, "updatedAt": 1000 }
]
```

### `src/ui/app.ts`

```ts
import { STATUSES, type Item, type Status } from '../domain/model.ts';
import { newId } from '../domain/ids.ts';
import { TRANSITIONS } from '../domain/transitions.ts';
import { capture, move, remove, restore, purgeTombstones, type OpFailure, type OpResult } from '../domain/operations.ts';
import { itemsInStatus } from '../domain/queries.ts';
import { mergeItems } from '../domain/merge.ts';
import { createLocalStorageRepository, DATA_KEY, LEGACY_KEY } from '../persistence/repository.ts';
import { SCHEMA_VERSION } from '../persistence/schema.ts';
import { serializeBackup, backupFilename, parseBackup } from '../persistence/backup.ts';
import { downloadText } from './download.ts';

// ---------------------------------------------------------------------------
// Presentation constants (labels are UI; which moves exist is domain)
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<Status, string> = {
  inbox: 'Inbox',
  next: 'Next actions',
  waiting: 'Waiting for',
  someday: 'Someday / maybe',
  done: 'Done',
};

function moveLabel(from: Status, to: Status): string {
  if (from === 'done') return '↺ Reopen';
  if (to === 'done') return '✓ Done';
  return `→ ${SECTION_LABELS[to].split(' ')[0]}`;
}

const FAILURE_MESSAGES: Record<OpFailure, string> = {
  'empty-input': 'Nothing to capture.',
  'not-found': 'That item no longer exists (it may have been changed in another tab).',
  'not-allowed': 'That item was moved in another tab. The list has been refreshed.',
  deleted: 'That item was deleted in another tab.',
  'not-deleted': 'That item was already restored.',
};

const LAST_EXPORT_KEY = 'gtd:lastExportAt';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const repo = createLocalStorageRepository();

/** All items, including tombstones. Views filter through domain/queries. */
let items: Item[] = [];
/** False when storage is unavailable, holds newer-version data, or unreadable data could not be set aside. */
let canWrite = true;
/** True when there are changes that exist only in memory. */
let unsaved = false;
let saveFailed = false;
let persistenceRequested = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Adopt what another tab (or a previous session) saved, if it is safe to do so. */
function refreshFromStorage(): void {
  if (!canWrite || unsaved) return;
  const fresh = repo.load();
  if (fresh.kind === 'ok' && fresh.invalid === 0 && fresh.from === SCHEMA_VERSION) items = fresh.items;
  else if (fresh.kind === 'empty') items = [];
}

/**
 * The single path for every change: re-read, apply a pure domain operation,
 * save, render. Step 1's rules are unchanged; what changed is that the
 * operation is now a tested domain function that can refuse.
 */
function commit(operation: (current: Item[]) => OpResult): OpResult {
  refreshFromStorage();
  const result = operation(items);
  if (result.ok) {
    items = result.items;
    save();
  } else {
    showToast(FAILURE_MESSAGES[result.reason]);
  }
  render();
  return result;
}

function save(): void {
  if (!canWrite) {
    unsaved = true;
    return;
  }
  const result = repo.save(items);
  if (result.ok) {
    unsaved = false;
    if (saveFailed) {
      saveFailed = false;
      clearStatus();
    }
  } else {
    unsaved = true;
    saveFailed = true;
    console.error('[gtd] save failed', result.error);
    showStatus(
      'Your last change could not be saved (browser storage may be full or blocked). Export your data now so nothing is lost.',
      [{ label: 'Export', run: exportData }],
    );
  }
}

/** Pause saving until the user has a copy of `raw`. */
function pauseWithDownload(message: string, raw: string): void {
  canWrite = false;
  showStatus(`${message} Saving is paused so it is not overwritten. Download it first, then resume.`, [
    { label: 'Download data', run: () => downloadText('gtd-unreadable-data.json', raw) },
    {
      label: 'Resume saving',
      run: () => {
        canWrite = true;
        clearStatus();
        save();
      },
    },
  ]);
}

function boot(): void {
  const result = repo.load();
  switch (result.kind) {
    case 'empty':
      items = [];
      break;

    case 'ok': {
      items = result.items;
      const problems: string[] = [];
      if (result.invalid > 0) problems.push(`${result.invalid} saved item(s) could not be read and were left out.`);

      // Anything we are about to overwrite that is not already safe elsewhere
      // gets stashed first. Legacy data is safe: we never write LEGACY_KEY.
      const needsCopy = result.source === DATA_KEY && (result.invalid > 0 || result.from < SCHEMA_VERSION);
      if (needsCopy) {
        const prefix = result.invalid > 0 ? 'gtd:quarantine:' : `gtd:pre-migration:v${result.from}:`;
        const key = repo.stash(prefix, result.raw);
        if (!key) {
          pauseWithDownload(problems.join(' ') || 'Your data needs an upgrade but no safety copy could be made.', result.raw);
          break;
        }
        if (problems.length) problems.push(`A copy was kept in this browser under "${key}".`);
      }
      if (problems.length) showStatus(problems.join(' '), [dismiss]);

      const purged = purgeTombstones(items, Date.now());
      const changed = purged.length !== items.length || result.from < SCHEMA_VERSION || result.invalid > 0;
      items = purged;
      if (changed) save(); // writes the current schema version
      break;
    }

    case 'corrupt': {
      items = [];
      if (result.source === LEGACY_KEY) {
        showStatus(
          `Your saved data could not be read. It was left untouched under "${LEGACY_KEY}" in this browser.`,
          [{ label: 'Download data', run: () => downloadText('gtd-unreadable-data.json', result.raw) }, dismiss],
        );
        break;
      }
      const key = repo.stash('gtd:quarantine:', result.raw);
      if (key) showStatus(`Your saved data could not be read. A copy was kept in this browser under "${key}".`, [dismiss]);
      else pauseWithDownload('Your saved data could not be read.', result.raw);
      break;
    }

    case 'newer':
      // Written by a newer build (e.g. after a rollback). Never overwrite it.
      canWrite = false;
      showStatus(
        `Your data was saved by a newer version of this app (schema ${result.version}). This version can't read it, so nothing will be saved here. Reload once the newer version is deployed.`,
      );
      break;

    case 'unavailable':
      canWrite = false;
      console.error('[gtd] storage unavailable', result.error);
      showStatus('Browser storage is unavailable, so nothing will be saved. Use Export before closing this tab.', [
        { label: 'Export', run: exportData },
      ]);
      break;
  }

  repo.subscribe(() => {
    refreshFromStorage();
    render();
  });

  window.addEventListener('beforeunload', (event) => {
    if (unsaved) event.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Commands (thin wrappers: the rules live in domain/operations)
// ---------------------------------------------------------------------------

function captureItem(value: string): void {
  commit((current) => capture(current, value, newId(), Date.now()));
  if (!persistenceRequested) {
    persistenceRequested = true;
    void requestPersistence();
  }
}

function moveItem(id: string, to: Status): void {
  commit((current) => move(current, id, to, Date.now()));
}

function deleteItem(item: Item): void {
  const result = commit((current) => remove(current, item.id, Date.now()));
  if (result.ok) {
    showToast(`Deleted "${item.title}".`, {
      label: 'Undo',
      run: () => commit((current) => restore(current, item.id, Date.now())),
    });
  }
}

function exportData(): void {
  downloadText(backupFilename(), serializeBackup(items));
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
  } catch {
    // Not critical: the export itself succeeded.
  }
  renderBackupInfo();
}

async function importFile(file: File): Promise<void> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    showToast(`Import failed: ${parsed.error}`);
    return;
  }
  const preview = mergeItems(items, parsed.items);
  const skipped = parsed.invalid > 0 ? ` ${parsed.invalid} unreadable entries will be skipped.` : '';
  const deletions = preview.deleted > 0 ? ` ${preview.deleted} will be deleted here, because the backup deleted them after your last change.` : '';
  const ok = window.confirm(
    `Import from "${file.name}"?\n\n` +
      `${preview.added} new, ${preview.updated} updated.${deletions} Where both sides changed an item, the newer version wins.${skipped}`,
  );
  if (!ok) return;

  let merged = preview;
  commit((current) => {
    merged = mergeItems(current, parsed.items);
    return { ok: true, items: merged.items };
  });
  showToast(`Imported: ${merged.added} new, ${merged.updated} updated, ${merged.deleted} deleted.`);
}

/** Ask the browser not to evict our storage under disk pressure. Best effort. */
async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Unsupported or refused: export remains the real safeguard.
  }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

interface NoticeAction {
  label: string;
  run: () => void;
}

const dismiss: NoticeAction = { label: 'Dismiss', run: () => clearStatus() };

function fillNotice(el: HTMLElement, message: string, actions: NoticeAction[]): void {
  el.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    el.appendChild(btn);
  }
  el.hidden = false;
}

function showStatus(message: string, actions: NoticeAction[] = []): void {
  const el = document.getElementById('gtd-status');
  if (el) fillNotice(el, message, actions);
}

function clearStatus(): void {
  const el = document.getElementById('gtd-status');
  if (el) {
    el.replaceChildren();
    el.hidden = true;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string, action?: NoticeAction): void {
  const el = document.getElementById('gtd-toast');
  if (!el) return;
  clearTimeout(toastTimer);
  const hide = () => {
    el.hidden = true;
    el.replaceChildren();
  };
  const actions = action ? [{ label: action.label, run: () => { hide(); action.run(); } }] : [];
  fillNotice(el, message, actions);
  toastTimer = setTimeout(hide, 8000);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderItem(item: Item): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'item';

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  li.appendChild(title);

  if (item.context) {
    const badge = document.createElement('span');
    badge.className = 'context-badge';
    badge.textContent = `@${item.context}`;
    li.appendChild(badge);
  }

  const actions = document.createElement('span');
  actions.className = 'item-actions';

  for (const to of TRANSITIONS[item.status]) {
    const btn = document.createElement('button');
    btn.textContent = moveLabel(item.status, to);
    btn.addEventListener('click', () => moveItem(item.id, to));
    actions.appendChild(btn);
  }

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'delete-btn';
  del.setAttribute('aria-label', `Delete "${item.title}"`);
  del.addEventListener('click', () => deleteItem(item));
  actions.appendChild(del);

  li.appendChild(actions);
  return li;
}

function render(): void {
  const root = document.getElementById('gtd-root');
  if (!root) return;
  root.innerHTML = '';

  for (const status of STATUSES) {
    const sectionItems = itemsInStatus(items, status);

    const details = document.createElement('details');
    details.open = status !== 'done';

    const summary = document.createElement('summary');
    summary.textContent = `${SECTION_LABELS[status]} (${sectionItems.length})`;
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'item-list';
    if (sectionItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing here.';
      list.appendChild(empty);
    } else {
      for (const item of sectionItems) list.appendChild(renderItem(item));
    }
    details.appendChild(list);
    root.appendChild(details);
  }
}

function renderBackupInfo(): void {
  const el = document.getElementById('backup-info');
  if (!el) return;
  let last: number | null = null;
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY));
    if (Number.isFinite(value) && value > 0) last = value;
  } catch {
    // Storage unavailable: treat as never exported.
  }
  if (last === null) {
    el.textContent = 'Never exported.';
    return;
  }
  const days = Math.floor((Date.now() - last) / 86_400_000);
  el.textContent = days === 0 ? 'Last export: today.' : `Last export: ${days} day${days === 1 ? '' : 's'} ago.`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function setupCaptureForm(): void {
  const form = document.getElementById('capture-form') as HTMLFormElement | null;
  const input = document.getElementById('capture-input') as HTMLInputElement | null;
  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    captureItem(value);
    input.value = '';
  });
}

function setupBackupControls(): void {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const fileInput = document.getElementById('import-file') as HTMLInputElement | null;

  exportBtn?.addEventListener('click', exportData);
  importBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importFile(file);
  });
}

boot();
setupCaptureForm();
setupBackupControls();
render();
renderBackupInfo();
```

### `src/ui/download.ts`

```ts
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### Tests

#### `src/domain/test-helpers.ts`

```ts
import type { Item } from './model.ts';

/** Build a valid item with sensible defaults; override what the test is about. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  const item: Item = { id: 'i1', title: 'Test item', status: 'inbox', createdAt: 1000, updatedAt: 1000, ...overrides };
  if (item.status === 'done' && item.completedAt === undefined) item.completedAt = item.updatedAt;
  return item;
}
```

#### `src/domain/capture.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, createItem } from './capture.ts';
import { isItem } from './model.ts';

const cases: [input: string, expected: ReturnType<typeof parseCapture>][] = [
  ['Buy milk @errands', { title: 'Buy milk', context: 'errands' }],
  ['Email jan@minbzk.nl', { title: 'Email jan@minbzk.nl' }],
  ['@errands', { title: '@errands' }],
  ['Call @bob about taxes', { title: 'Call @bob about taxes' }],
  ['Fix bike @home @weekend', { title: 'Fix bike @home', context: 'weekend' }],
  ['  spaced   @home  ', { title: 'spaced', context: 'home' }],
  ['trailing @', { title: 'trailing @' }],
];

for (const [input, expected] of cases) {
  test(`parseCapture(${JSON.stringify(input)})`, () => {
    assert.deepEqual(parseCapture(input), expected);
  });
}

test('parseCapture never drops non-whitespace characters', () => {
  for (const [input] of cases) {
    const { title, context } = parseCapture(input);
    const kept = (title + (context ?? '')).replace(/[\s@]/g, '');
    assert.equal(kept, input.replace(/[\s@]/g, ''), input);
  }
});

test('createItem produces a valid inbox item with the given id and time', () => {
  const item = createItem('Buy milk @errands', 'id-1', 5000);
  assert.deepEqual(item, { id: 'id-1', title: 'Buy milk', context: 'errands', status: 'inbox', createdAt: 5000, updatedAt: 5000 });
  assert.ok(isItem(item));
  assert.ok(!('context' in createItem('No context', 'id-2', 1)), 'no undefined context key');
});
```

#### `src/domain/model.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isItem } from './model.ts';
import { newId } from './ids.ts';
import { makeItem } from './test-helpers.ts';

test('isItem accepts valid items, including tombstones', () => {
  assert.ok(isItem(makeItem()));
  assert.ok(isItem(makeItem({ status: 'done', completedAt: 2000, updatedAt: 2000 })));
  assert.ok(isItem(makeItem({ deletedAt: 3000, updatedAt: 3000 })));
});

test('isItem rejects wrong shapes', () => {
  for (const bad of [null, 42, 'x', [], {}, { ...makeItem(), status: 'archived' }, { ...makeItem(), updatedAt: NaN }, { ...makeItem(), id: '' }, { ...makeItem(), deletedAt: 'yesterday' }]) {
    assert.ok(!isItem(bad), JSON.stringify(bad));
  }
});

test('isItem enforces: completedAt exists if and only if done', () => {
  assert.ok(!isItem({ ...makeItem(), status: 'done', completedAt: undefined }));
  assert.ok(!isItem({ ...makeItem({ status: 'next' }), completedAt: 5 }));
});

test('newId falls back to a valid v4 UUID without crypto.randomUUID', (t) => {
  // randomUUID lives on Crypto.prototype; an own property shadows it until deleted.
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  t.after(() => delete (crypto as { randomUUID?: unknown }).randomUUID);
  assert.equal(typeof crypto.randomUUID, 'undefined');
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
```

#### `src/domain/transitions.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, isItem, type Status } from './model.ts';
import { TRANSITIONS, canTransition, transition } from './transitions.ts';
import { makeItem } from './test-helpers.ts';

function reachable(from: Status): Set<Status> {
  const seen = new Set<Status>([from]);
  const queue = [from];
  while (queue.length) for (const to of TRANSITIONS[queue.shift()!]) if (!seen.has(to)) seen.add(to), queue.push(to);
  return seen;
}

test('the table covers every status and never targets itself', () => {
  for (const from of STATUSES) {
    assert.ok(Array.isArray(TRANSITIONS[from]), from);
    assert.ok(!TRANSITIONS[from].includes(from), `${from} -> ${from}`);
  }
});

test('workflow sanity: every status can reach done, and done can be reopened', () => {
  for (const from of STATUSES) assert.ok(reachable(from).has('done'), `${from} cannot reach done`);
  assert.ok(canTransition('done', 'next'));
});

test('inbox items must be clarified before they can be done', () => {
  assert.ok(!canTransition('inbox', 'done'));
});

test('every allowed transition keeps the item valid (completedAt invariant)', () => {
  for (const from of STATUSES) {
    for (const to of TRANSITIONS[from]) {
      const moved = transition(makeItem({ status: from }), to, 9000);
      assert.ok(isItem(moved), `${from} -> ${to}`);
      assert.equal(moved.status, to);
      assert.equal(moved.updatedAt, 9000);
      assert.equal(moved.completedAt, to === 'done' ? 9000 : undefined);
    }
  }
});
```

#### `src/domain/operations.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture, move, remove, restore, purgeTombstones, TOMBSTONE_RETENTION_MS } from './operations.ts';
import { itemsInStatus, liveItems } from './queries.ts';
import type { Item } from './model.ts';
import { makeItem } from './test-helpers.ts';

test('capture appends an inbox item and refuses empty input', () => {
  const r = capture([], 'Buy milk', 'n1', 10);
  assert.ok(r.ok);
  assert.equal(r.items[0].status, 'inbox');
  assert.deepEqual(capture([], '   ', 'n2', 10), { ok: false, reason: 'empty-input' });
});

test('move applies allowed transitions and refuses the rest without throwing', () => {
  const items = [makeItem({ id: 'a', status: 'inbox' })];
  const ok = move(items, 'a', 'next', 20);
  assert.ok(ok.ok && ok.items[0].status === 'next');
  assert.deepEqual(move(items, 'a', 'done', 20), { ok: false, reason: 'not-allowed' });
  assert.deepEqual(move(items, 'zzz', 'next', 20), { ok: false, reason: 'not-found' });
});

test('operations never mutate their input', () => {
  // Frozen input: any in-place write would throw (ES modules run in strict mode).
  const items = Object.freeze([Object.freeze(makeItem({ id: 'a' }))]) as unknown as Item[];
  move(items, 'a', 'next', 20);
  remove(items, 'a', 20);
  capture(items, 'x', 'n', 20);
});

test('remove makes a tombstone that queries hide; restore brings it back', () => {
  const items = [makeItem({ id: 'a', status: 'next' })];
  const removed = remove(items, 'a', 30);
  assert.ok(removed.ok);
  assert.equal(removed.items.length, 1, 'tombstone is kept');
  assert.equal(removed.items[0].deletedAt, 30);
  assert.equal(removed.items[0].updatedAt, 30, 'delete bumps updatedAt so merges see it');
  assert.deepEqual(itemsInStatus(removed.items, 'next'), []);
  assert.deepEqual(liveItems(removed.items), []);
  assert.deepEqual(move(removed.items, 'a', 'done', 31), { ok: false, reason: 'deleted' });

  const restored = restore(removed.items, 'a', 40);
  assert.ok(restored.ok);
  assert.equal(restored.items[0].deletedAt, undefined);
  assert.equal(restored.items[0].updatedAt, 40);
  assert.deepEqual(restore(restored.items, 'a', 41), { ok: false, reason: 'not-deleted' });
});

test('purgeTombstones drops only tombstones past retention', () => {
  const now = 10 * TOMBSTONE_RETENTION_MS;
  const items = [
    makeItem({ id: 'live' }),
    makeItem({ id: 'recent', deletedAt: now - 1000, updatedAt: now - 1000 }),
    makeItem({ id: 'old', deletedAt: now - TOMBSTONE_RETENTION_MS, updatedAt: 0 }),
  ];
  assert.deepEqual(purgeTombstones(items, now).map((i) => i.id), ['live', 'recent']);
});

test('done items are ordered by completion time, others by last update', () => {
  const items = [
    makeItem({ id: 'd1', status: 'done', completedAt: 100, updatedAt: 500 }),
    makeItem({ id: 'd2', status: 'done', completedAt: 200, updatedAt: 200 }),
  ];
  assert.deepEqual(itemsInStatus(items, 'done').map((i) => i.id), ['d2', 'd1']);
});
```

#### `src/domain/merge.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeItems } from './merge.ts';
import { makeItem } from './test-helpers.ts';

const a = makeItem({ id: 'a', updatedAt: 10 });
const b = makeItem({ id: 'b', updatedAt: 10 });

test('adds unknown ids and counts them', () => {
  const r = mergeItems([a], [a, b]);
  assert.deepEqual([r.added, r.updated, r.deleted], [1, 0, 0]);
  assert.equal(r.items.length, 2);
});

test('is idempotent: merging the same input twice changes nothing', () => {
  const once = mergeItems([a], [a, b]).items;
  const twice = mergeItems(once, [a, b]);
  assert.deepEqual(twice.items, once);
  assert.deepEqual([twice.added, twice.updated, twice.deleted], [0, 0, 0]);
});

test('the newer copy wins in both directions; ties keep current', () => {
  const newer = { ...a, title: 'newer', updatedAt: 20 };
  assert.equal(mergeItems([a], [newer]).items[0].title, 'newer');
  assert.equal(mergeItems([newer], [a]).items[0].title, 'newer');
  assert.equal(mergeItems([a], [{ ...a, title: 'tie' }]).items[0].title, a.title);
});

test('an old backup cannot resurrect an item deleted since', () => {
  const tombstone = { ...a, deletedAt: 20, updatedAt: 20 };
  const r = mergeItems([tombstone], [a]);
  assert.equal(r.items[0].deletedAt, 20);
  assert.deepEqual([r.added, r.updated, r.deleted], [0, 0, 0]);
});

test('a newer deletion in the backup is applied and counted', () => {
  const r = mergeItems([a], [{ ...a, deletedAt: 20, updatedAt: 20 }]);
  assert.equal(r.items[0].deletedAt, 20);
  assert.equal(r.deleted, 1);
});

test('a restore newer than the deletion wins', () => {
  const tombstone = { ...a, deletedAt: 20, updatedAt: 20 };
  const restored = { ...a, updatedAt: 30 };
  assert.equal(mergeItems([tombstone], [restored]).items[0].deletedAt, undefined);
});
```

#### `src/persistence/schema.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate, detectVersion, SCHEMA_VERSION } from './schema.ts';

const v1Sample: unknown = JSON.parse(readFileSync(new URL('./fixtures/v1-sample.json', import.meta.url), 'utf8'));

test('detectVersion', () => {
  assert.equal(detectVersion([]), 1);
  assert.equal(detectVersion({ schemaVersion: 2, items: [] }), 2);
  assert.equal(detectVersion({ schemaVersion: 7 }), 7);
  for (const bad of [null, 'x', {}, { schemaVersion: '2' }, { schemaVersion: 1.5 }]) assert.equal(detectVersion(bad), null);
});

test('v1 fixture migrates to the current schema', () => {
  const r = migrate(v1Sample);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.from, 1);
  assert.equal(r.doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.invalid, 1, 'the "archived" entry is dropped and counted');
  assert.deepEqual(r.doc.items.map((i) => i.id), ['a1', 'a2', 'a3']);
  const done = r.doc.items.find((i) => i.id === 'a3');
  assert.equal(done?.completedAt, 3000, 'completedAt backfilled from updatedAt');
  assert.equal(r.doc.items.find((i) => i.id === 'a2')?.completedAt, undefined);
});

test('current-version documents pass through unchanged', () => {
  const doc = { schemaVersion: SCHEMA_VERSION, items: [{ id: 'x', title: 't', status: 'inbox', createdAt: 1, updatedAt: 1 }] };
  const r = migrate(doc);
  assert.ok(r.kind === 'ok' && r.from === SCHEMA_VERSION && r.invalid === 0);
  assert.deepEqual(r.kind === 'ok' && r.doc, doc);
});

test('migrating is idempotent: migrate(migrate(x).doc) === migrate(x).doc', () => {
  const first = migrate(v1Sample);
  assert.ok(first.kind === 'ok');
  const second = migrate(first.kind === 'ok' ? first.doc : null);
  assert.deepEqual(second.kind === 'ok' && second.doc, first.doc);
});

test('documents from a newer version are refused, not guessed at', () => {
  assert.deepEqual(migrate({ schemaVersion: SCHEMA_VERSION + 1, items: [] }), { kind: 'newer', version: SCHEMA_VERSION + 1 });
});

test('unrecognisable shapes are corrupt', () => {
  for (const bad of [null, {}, { schemaVersion: 2 }, { schemaVersion: 2, items: 'nope' }]) {
    assert.equal(migrate(bad).kind, 'corrupt', JSON.stringify(bad));
  }
});
```

#### `src/persistence/repository.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStorageRepository, DATA_KEY, LEGACY_KEY, type KeyValueStore } from './repository.ts';
import { SCHEMA_VERSION } from './schema.ts';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

const v1 = JSON.stringify([{ id: 'a', title: 'A', status: 'done', createdAt: 1, updatedAt: 2 }]);

function setup(initial: Record<string, string> = {}) {
  const store = new MemoryStore();
  for (const [k, v] of Object.entries(initial)) store.data.set(k, v);
  return { store, repo: createLocalStorageRepository(() => store, null) };
}

test('empty storage loads as empty', () => {
  assert.deepEqual(setup().repo.load(), { kind: 'empty' });
});

test('legacy data is migrated in memory and saving never touches the legacy key', () => {
  const { store, repo } = setup({ [LEGACY_KEY]: v1 });
  const loaded = repo.load();
  assert.ok(loaded.kind === 'ok');
  if (loaded.kind !== 'ok') return;
  assert.equal(loaded.source, LEGACY_KEY);
  assert.equal(loaded.from, 1);
  assert.equal(loaded.items[0].completedAt, 2);

  assert.deepEqual(repo.save(loaded.items), { ok: true });
  assert.equal(store.getItem(LEGACY_KEY), v1, 'legacy copy untouched (rollback safety)');
  assert.equal(JSON.parse(store.getItem(DATA_KEY)!).schemaVersion, SCHEMA_VERSION);

  const reloaded = repo.load();
  assert.ok(reloaded.kind === 'ok' && reloaded.source === DATA_KEY && reloaded.from === SCHEMA_VERSION);
});

test('current data wins over legacy data', () => {
  const current = JSON.stringify({ schemaVersion: SCHEMA_VERSION, items: [] });
  const { repo } = setup({ [LEGACY_KEY]: v1, [DATA_KEY]: current });
  const loaded = repo.load();
  assert.ok(loaded.kind === 'ok' && loaded.items.length === 0);
});

test('corrupt, newer and unavailable are reported, never thrown', () => {
  assert.equal(setup({ [DATA_KEY]: '{oops' }).repo.load().kind, 'corrupt');
  assert.deepEqual(setup({ [DATA_KEY]: JSON.stringify({ schemaVersion: 99, items: [] }) }).repo.load(), {
    kind: 'newer',
    version: 99,
  });
  const throwing = createLocalStorageRepository(() => {
    throw new DOMException('blocked', 'SecurityError');
  }, null);
  assert.equal(throwing.load().kind, 'unavailable');
  assert.equal(throwing.save([]).ok, false);
  assert.equal(throwing.stash('p:', 'x'), null);
});

test('save failures are returned, not thrown', () => {
  const { store, repo } = setup();
  store.failWrites = true;
  const r = repo.save([]);
  assert.equal(r.ok, false);
});

test('stash keeps a copy under a prefixed key', () => {
  const { store, repo } = setup();
  const key = repo.stash('gtd:quarantine:', 'raw');
  assert.ok(key?.startsWith('gtd:quarantine:'));
  assert.equal(store.getItem(key!), 'raw');
});
```

#### `src/persistence/backup.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, parseBackup } from './backup.ts';

const item = { id: 'a', title: 'A', status: 'done', createdAt: 1, updatedAt: 2 } as const;

test('v2 round trip keeps tombstones', () => {
  const items = [{ ...item, completedAt: 2 }, { id: 't', title: 'gone', status: 'inbox' as const, createdAt: 1, updatedAt: 5, deletedAt: 5 }];
  const r = parseBackup(serializeBackup(items));
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.items, items);
});

test('step-1 backup files (v1) are migrated on import', () => {
  const v1File = JSON.stringify({ format: 'personal-gtd-backup', version: 1, exportedAt: 'x', items: [item] });
  const r = parseBackup(v1File);
  assert.ok(r.ok);
  assert.equal(r.ok && r.items[0].completedAt, 2);
});

test('bare arrays and raw v2 storage values are accepted', () => {
  assert.ok(parseBackup(JSON.stringify([item])).ok);
  assert.ok(parseBackup(JSON.stringify({ schemaVersion: 2, items: [] })).ok);
});

test('newer, foreign and damaged files are refused with a reason', () => {
  const newerEnvelope = parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 3 }));
  const newerSchema = parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 2, data: { schemaVersion: 9, items: [] } }));
  assert.match(!newerEnvelope.ok ? newerEnvelope.error : '', /newer version/);
  assert.match(!newerSchema.ok ? newerSchema.error : '', /newer version/);
  assert.equal(parseBackup('{"foo":1}').ok, false);
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'personal-gtd-backup', version: 2, data: {} })).ok, false);
});
```

#### `src/architecture.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the layering: domain <- persistence <- ui.
 * Cheap to keep, and it stops the structure from eroding one import at a time.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

function imports(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8');
  return [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

const RULES: Record<string, { mayImport: string[]; forbiddenGlobals: RegExp | null }> = {
  domain: { mayImport: ['domain'], forbiddenGlobals: /\b(window|document|localStorage|sessionStorage|navigator)\b/ },
  persistence: { mayImport: ['domain', 'persistence'], forbiddenGlobals: /\b(document|navigator)\b/ },
};

for (const [layer, rule] of Object.entries(RULES)) {
  test(`${layer}/ only depends on: ${rule.mayImport.join(', ')}`, () => {
    for (const file of sourceFiles(layer)) {
      for (const spec of imports(file)) {
        if (spec.startsWith('node:')) {
          assert.ok(file.endsWith('.test.ts'), `${file}: node built-ins only in tests`);
          continue;
        }
        assert.ok(spec.startsWith('.'), `${file}: unexpected package import "${spec}"`);
        const target = join(file, '..', spec).split(/[\\/]/)[0];
        assert.ok(rule.mayImport.includes(target), `${file} imports ${spec} (layer "${target}")`);
      }
      if (rule.forbiddenGlobals && !file.endsWith('.test.ts')) {
        const code = readFileSync(join(SRC, file), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
        assert.doesNotMatch(code, rule.forbiddenGlobals, `${file} uses a browser global`);
      }
    }
  });
}
```
