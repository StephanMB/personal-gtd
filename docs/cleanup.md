# Cleanup: loose ends from steps 1–3

A pass back through [`step-1-data-safety.md`](step-1-data-safety.md), [`step-2-groundwork.md`](step-2-groundwork.md) and [`step-3-ui.md`](step-3-ui.md), plus a reading of the code those documents produced, looking for anything that was parked, promised, left half-done, or quietly broken.

Findings are grouped by what you should do with them:

- **A. Verification debt** — do this first; nothing else is meaningful until it's done.
- **B. Already closed** — limitations the later steps fixed. Listed so nobody fixes them twice.
- **C. Worth fixing now** — 12 small items, mostly in the code I wrote. Two are real bugs.
- **D. Fix inside a step 4 increment** — cheaper when done together with the feature.
- **E. Accepted** — leave alone, with the reason.
- **F. Documentation hygiene.**

Effort: **S** = minutes, **M** = an hour or two.

---

## Status of this pass (12 September 2026)

**A. Verification debt.** A1-A4 and A6 are done: the packages install, the type
check passes against the real types (the JSX augmentation needed no alternative
form), `npm test` runs the NLDD import guard against the installed package,
the app was run and looked at, and all Playwright tests pass first time.
**A5 (`docker build`) is still open** - Docker is not installed on this machine.

Three things A3 and A4 surfaced, fixed as they came up:

- the app rendered blank: nothing gave `nldd-app-view` a height;
- the sidebar announced itself in Dutch: a navigation list takes `aria-label`,
  not `accessible-label`;
- every row was three times taller than it needed to be: `nldd-button-group`
  is vertical by default.

**C. Worth fixing now.** All twelve are done; each heading below says in which
commit. C12 was built rather than deferred.

**D and E** are unchanged: deferred to step 4, or accepted with their reasons.

**F. Documentation hygiene** is done in this pass: README rewritten, `CLAUDE.md`
and `docs/README.md` added, steps 1 and 2 marked as snapshots, and the
optional-field rule written into step 2's migration section.

Test counts after this pass: 81 unit tests (`npm test`) and 15 Playwright tests,
17 runs including the phone project (`npm run test:e2e`).

---

## A. Verification debt (do first)

Steps 1 and 2 were verified as far as the sandbox allowed. Step 3 was not: the UI packages couldn't be installed, so **that code has never run in a browser**. Until this is worked through, everything below is speculative.

| # | Do | From |
|---|---|---|
| A1 | `npm install`, then `npm run typecheck` against real types. Expected friction: the JSX augmentation form in `nldd-jsx.d.ts` (step 3, section 6 names the alternative) | step 3 |
| A2 | `npm test` — the NLDD import guard now runs against the installed package instead of skipping | step 3 |
| A3 | `npm run dev` and actually look at it | step 3 |
| A4 | `npm run test:e2e` — the real test of the Preact/web-component interop rules. Failing locators most likely mean an accessible name differs from what I derived from the docs | step 3 |
| A5 | `docker build .` — never run since step 1 | steps 1–3 |
| A6 | Confirm `node --version` ≥ 22.18 locally, and that TypeScript 7's `tsc` accepts the compiler options | step 2 |

Do A1–A6 in order and fix what they surface before starting section C. Several items in C are *predictions*; A3 and A4 will tell you which ones are real.

---

## B. Already closed (don't re-fix)

| Limitation, as written | Closed by |
|---|---|
| "Import can bring back deleted items" (step 1) | step 2, tombstones |
| "Undo is shallow: last delete only, 8 seconds" (step 1) | step 3: a 50-entry stack, entry-targeted undo, Ctrl+Z |
| "`window.confirm` for import looks dated" (step 1) | step 3: import applies immediately with Undo |
| "The UI is hand-built DOM with full re-renders" (step 2) | step 3: Preact + signals |
| "`app.ts` isn't unit-tested" (step 2) | step 3: the policy moved into the store, which has 15 tests |
| "The repository stays synchronous *because there's no queue yet*" (step 2, §2.6) | step 3: the queue exists; the IndexedDB switch is now unblocked (4.8) |

---

## C. Worth fixing now

### C1. The "paused" banner says something false (bug) — S  **Done (81fb76a).**

`Problem` carries `cause: 'corrupt' | 'unreadable-items' | 'migration'`, and **nothing reads it**. `copy.problem()` words every paused case as "Your saved data could not be read". When the cause is `migration`, that's untrue: the data is perfectly readable, it needs upgrading and no safety copy would fit in storage. Someone reading that banner would think their data is damaged.

Fix: branch the wording on `cause`, and keep the field (it exists precisely for this). In `src/ui/copy.ts`.

### C2. Storage errors are now thrown away (regression) — S  **Done (81fb76a).**

Steps 1 and 2 logged the underlying error: `console.error('[gtd] save failed', result.error)`. When the policy moved into the store in step 3, that went with it — `save()` and `boot()` now discard `result.error` entirely. So "Your last change could not be saved" arrives with no way to find out *why* (quota? blocked? private mode?), which is exactly when you want the detail.

Fix: give `createStore` an `onError` option defaulting to `console.error`, and call it wherever a repository result carries an error. An injected logger keeps the store testable and stays inside the layer rules.

### C3. A failing command becomes an unhandled promise rejection — S  **Done (81fb76a).**

`dispatch` returns the queued promise, and the UI calls it as `void run(...)`. A bug inside a command therefore surfaces as an unhandled rejection in the console and *nothing on screen*: the click looks ignored. Everything a user can cause is already a returned failure, so this only fires on genuine bugs — which is exactly when silence is worst.

Fix: wrap the command body in try/catch inside the store, report it through `onError` (C2), and surface a generic "Something went wrong, your data wasn't changed" notification.

### C4. `refresh()` also needs to notice storage going bad — S/M  **Done (81fb76a).**

`refresh()` (run before every command and on every cross-tab event) only handles `ok` and `empty`. If storage degrades *after* boot — another tab writes garbage, data arrives from a newer build, or the browser revokes access mid-session — it silently does nothing and the app keeps writing as though all is well. Boot handles all five cases; refresh handles two.

Fix: reuse boot's handling for `corrupt`/`newer`/`unavailable` when they appear later. The store tests already have the fixtures for it.

### C5. Every command notifies subscribers even when nothing changed — S  **Done (c58750e).**

`refresh()` calls `set({ items })` unconditionally, with freshly parsed objects, so each command produces an extra state notification and re-renders every list component for nothing.

Fix: the repository already returns the raw string it parsed. Keep the last one seen and skip the update when identical.

### C6. The Inbox is sorted newest-first, which is wrong for clarifying — S  **Done (15c1c97).**

`itemsInStatus` sorts everything but Done by `updatedAt` descending. Two consequences: the Inbox shows the newest capture first, while GTD processes **oldest first**; and any touch moves a row to the top, so the list reshuffles under you.

This matters more than it looks, because 4.1's clarify flow takes "the first inbox item" — with today's order that's the newest, which is the opposite of the method.

Fix: sort Inbox by `createdAt` ascending, keep the other lists on `updatedAt` descending, keep Done on `completedAt`. One query, one test.

### C7. Two `<h1>`s on every page — S  **Done (15c1c97).**

`nldd-top-title-bar` renders its title as an `h1` (documented in its source), and it's used twice: the sidebar brand and the page title. Two competing top-level headings on one page is a real structure problem for screen readers, and it makes "the page heading" ambiguous.

Fix: keep the bar for the main pane (that *is* the page heading) and render the sidebar brand with `nldd-title`, which is visual only and takes your own heading element — so it can be an `h2`, or no heading at all since the navigation already has an accessible label.

### C8. The empty state is a fake list row — S  **Done (15c1c97).**

`ListPage` renders "Nothing here" as an `nldd-list-item`, so assistive technology announces a list containing one item that isn't one. `nldd-list` has an `empty` slot for exactly this (and a `no-results` slot for when filtering hides everything, which 4.4 will want).

Fix: move the message into `slot="empty"`. Worth checking in Storybook when the slot shows.

### C9. Dead command path: `restore` — S  **Done (81fb76a).**

The store has a `restore` command and the domain has the operation, but **nothing dispatches it**: the delete notification uses entry-targeted undo instead. The `not-deleted` failure reason and its copy line exist only for it.

Fix: drop the store command, the failure reason and the copy line. Keep the domain operation and its test — it's eight lines, and a "Trash" view (where you'd restore something after the notification is long gone) is the obvious future caller. Alternatively, do the opposite and keep the command by giving it a caller; what shouldn't stay is a command with neither caller nor plan.

Same question, smaller stakes: `UndoEntry.command` is stored and never read. Either use it to word the undo notification ("Undone: moved to Next actions") or drop it.

### C10. The accent palette override can silently half-break — M  **Done (5cbfcea).**

`theme.css` repoints 25 `--primitives-color-accent-*` steps at another palette, by hand. If NLDD adds, renames or removes a step, the steps you didn't override quietly fall back to lintblauw — no error, just a slightly government-blue button somewhere.

Fix: a guard test in the spirit of the import guard. Read NLDD's `variables.css` from `node_modules`, extract the accent step names, and assert that `theme.css` overrides exactly that set. It fails loudly on the next NLDD upgrade, which is when you want to know.

### C11. Shortcut digits are derived from the status list — S  **Done (c58750e).**

`LIST_KEYS` is built from `STATUSES` by index. The moment 4.2 adds Projects (or 4.3 adds Today), every digit shifts and the muscle memory you built breaks.

Fix now, before that happens: write the map explicitly, so a new view has to be given a key deliberately, or none.

### C12. Quarantine keys accumulate with no way to see them — M  **Done (5cbfcea).**

Step 1 left this open and it's still open: `gtd:quarantine:…` and `gtd:pre-migration:…` keys are written when data can't be read, and then nothing ever mentions them again. They take space in the same 5 MB budget, and the only way to recover one is the console.

Fix: a small "Recovered data" section (sidebar or a sheet) that lists those keys with a date, a download button and a delete button. It closes the loop the safety mechanism opened — right now the app carefully saves data it never offers back.

---

## D. Fix inside a step 4 increment

| Item | Where it belongs | Note |
|---|---|---|
| `gtd:lastExportAt` lives in its own localStorage key, outside the document, so it isn't exported and a fresh browser always says "never exported" | 4.5, which introduces settings | The only app state outside the document |
| Whole-list writes; a failed save plus concurrent tabs can still overwrite | 4.8 (IndexedDB, per-record writes) | The last of step 1's data-safety limitations |
| Cross-tab refresh via the `storage` event | 4.8 (`BroadcastChannel`) | The localStorage repository can keep its version |
| Sidebar rows are buttons, so no middle-click or "open in new tab" | 4.2, when projects get real pages | Fine for five fixed lists; not fine for a hundred projects |
| A single free-text context per item | 4.4 | |
| Safari deleting storage after 7 days; the 5 MB quota | 4.10 (installable) and 4.8 | |
| Firefox and WebKit Playwright projects | 4.10 | WebKit ≈ what your phone runs; add it when the phone matters |

---

## E. Accepted, leave alone

- **No redo.** Undo is per tab and lost on reload. Adding redo means keeping an inverse of an inverse; persisting history means an operation log. Neither pays for itself for one person on one machine.
- **Tombstones purge after 90 days,** so a backup older than that can resurrect deleted items. Any retention is a trade-off between storage and resurrection; 90 days covers every realistic restore.
- **Tombstones purge only at boot,** so a tab left open for weeks doesn't purge. Harmless.
- **Merge keeps the current copy on an exact `updatedAt` tie.** Deterministic, documented, and only reachable with millisecond-identical edits.
- **NLDD is beta and ships breaking changes as patch releases.** Not fixable, only managed: read the changelog, and let the import guard, the accent guard (C10) and Playwright catch the rest. Half an hour a month.
- **English UI with Dutch component defaults.** Genuinely open, but it's a decision, not a defect: either switch the app to Dutch (one file, and `lang="nl"` in `index.html`) or override the component strings you actually see. Don't leave it mixed forever, but don't let it block anything either.

---

## F. Documentation hygiene

1. **Mark the step documents as snapshots.** A one-line note at the top of steps 1 and 2 saying what a later step changed: the storage key (`gtd:items` → `gtd:data`, so step 1's console snippets target the wrong key) and the file layout (`src/lib/` no longer exists). Without it, the test scripts in step 1 quietly fail.
2. **Write the version-bump nuance where it belongs.** The rule that *additive optional fields need no schema bump* (because a bump makes older builds read-only) was worked out in step 4. It belongs in step 2's migration section and in `CLAUDE.md`, not only in the feature plan.
3. **Add the `docs/README.md` index and the `CLAUDE.md`**, and update the README — all drafted in step 4, section 0. The README is the most-wrong document in the repo right now.
4. **Record C1–C12 as closed** when you do them, so the next pass doesn't rediscover them.

---

## Suggested order

Six commits, each independently revertible:

1. **A1–A6**, plus whatever they surface. Nothing below is real until this passes.
2. **Correctness:** C1, C2, C3, C4 — the banner lie, the lost diagnostics, the silent failure, the blind refresh.
3. **Behaviour and accessibility:** C6, C7, C8 — Inbox order, one `h1`, the empty slot. Do these before 4.1, which depends on C6.
4. **Subtraction:** C5, C9, C11 — the redundant notification, the dead command, the explicit key map.
5. **Guards:** C10, and C12 if you want the recovery UI.
6. **Docs:** section F, together with step 4's section 0.

Commits 2–4 are perhaps an evening between them. Two of those items (C1, C6) are things a user would actually notice, and C6 is a prerequisite for the first feature in step 4 — which is the argument for doing this pass now rather than after.
