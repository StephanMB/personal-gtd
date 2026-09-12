# Step 4: Functionality

Plan for `personal-gtd`, step 4 of the refactoring plan. It follows [`step-1-data-safety.md`](step-1-data-safety.md), [`step-2-groundwork.md`](step-2-groundwork.md) and [`step-3-ui.md`](step-3-ui.md).

Steps 1–3 changed almost nothing a user can see. This step is where that pays off: each increment below is a feature you'd notice, and each is small *because* of the groundwork. **This document contains no code.** Per increment it states the job to be done, the user journey, which components are touched, the architectural decisions involved, and any new package or switch.

**Read section 0 first.** The README and a few config files still describe the app as it was before step 1, and there are leftovers from Astro to clear out. That's cheap to fix and confusing to leave.

---

## The arc

The order is not arbitrary:

1. **Start with the flow, not the data** (4.1). Clarifying the inbox needs no schema change at all and is the first thing that makes the app feel like GTD rather than a list with buttons.
2. **Then the two entities GTD actually needs** (4.2 projects, 4.4 contexts). Both need a migration, which is exactly what step 2 built.
3. **Then time** (4.3), which turns "a list of everything" into "what's relevant today".
4. **Then the review** (4.5), which is what makes the system trustworthy, and which is almost entirely queries you already have the pattern for.
5. **Then depth and volume** (4.6 notes, 4.7 recurrence), which is what pushes storage past what localStorage should hold.
6. **Then the infrastructure that volume demands** (4.8 IndexedDB), the convenience that follows from it (4.9 search and saved views), and finally the phone (4.10).
7. **Sync last** (4.11), and only if two devices are really in daily use.

Each of 4.1–4.7 is shippable on its own. None of them requires the one after it.

---

## 0. Housekeeping: what's out of sync

Do this before 4.1. All of it is documentation and configuration, so it's an hour at most.

### 0.1 README.md is three steps stale

It still says: Astro static site, "all data lives in `localStorage` — no backend, no accounts", `@` as the only capture syntax, and `npm install && npm run dev` as the whole workflow. Since then the app gained versioned storage, export/import, 72 unit tests plus Playwright, a Vite build, Preact, and a design system with licence conditions that anyone cloning the repo needs to know about.

Replace it with something like this:

````markdown
# Personal GTD

A local-first Getting Things Done app for one person. Capture to an inbox,
clarify into next actions / waiting-for / someday-maybe, complete them.
All data stays in your browser; there is no backend and no account.

## Capture syntax

    Buy milk @errands      → an action with the context "errands"

A context is a trailing `@word`. Email addresses are left alone.

## Keyboard

| Keys | Action |
|---|---|
| `c` | Focus the capture field |
| `1`–`5` | Inbox, Next actions, Waiting for, Someday, Done |
| Ctrl/⌘+Z | Undo |
| ↑ ↓ Tab | Move between rows / through a row's buttons |

## Your data

- Stored in this browser under `gtd:data` (schema version 2), as a document
  of items. Deleted items are kept as hidden markers so that importing an old
  backup can't bring them back.
- **Export regularly.** It is the only real backup: clearing site data wipes
  everything, and Safari deletes storage for sites unused for 7 days.
  Export/import is in the sidebar; import merges and never removes.
- Unreadable data is never overwritten: it is set aside and the app says so.

## Stack

Vite + Preact (with signals) + [NLDD design system](https://github.com/MinBZK/storybook)
(web components). Built in a two-stage Docker image (`node:24-bookworm-slim`
builder → `nginx-unprivileged:1.27-alpine` runtime).

Layers, enforced by a test: `domain` ← `persistence` ← `store` ← `ui`.
`domain` is pure TypeScript with no browser APIs.

### Design system note

NLDD is EUPL-1.2 licensed, but its Rijksoverheid font and visual identity are
reserved for government publications. This app therefore imports
`@nldd/design-system/styles/system-font` (no Rijksoverheid font), uses its own
favicon, and repoints the accent colour away from lintblauw. Keep it that way.

## Development

Requires Node 22.18+ (the tests run TypeScript directly).

```bash
npm install
npm run dev        # http://localhost:4321
npm run verify     # typecheck + unit tests + build
npm run test:e2e   # Playwright (first time: npx playwright install chromium)
```

## Docker

```bash
docker build -t personal-gtd .
docker run -p 8000:8000 personal-gtd   # http://localhost:8000
```

## Docs

`docs/` holds the refactoring plan, one document per step, with the reasoning
behind the current structure. Each is a snapshot of its step: later steps
supersede earlier file layouts (step 1's `src/lib/` no longer exists).
````

### 0.2 Config drift

| File | What's wrong | Fix |
|---|---|---|
| `.gitignore` | Ignores `.astro/`, which no longer exists; nothing for Playwright output | Drop `.astro/`; add `test-results/` and `playwright-report/` |
| `.dockerignore` | Same `.astro/` leftover; no Playwright output | Same change. **Don't** exclude `e2e/` or `playwright.config.ts`: the Docker build runs `npm run verify`, whose type check covers them. Excluding them would silently shrink what Docker checks |
| Working tree | `.astro/` and the old Astro `dist/` are still on disk | Delete both. `dist/` is rebuilt by Vite; the stale one contains the pre-step-1 app, which is confusing to inspect |
| `.claude/launch.json` | Still correct (port 4321 matches `vite.config.ts`) | Nothing, but it breaks if you ever change that port |
| `nginx.conf` | No security headers | Optional: `X-Content-Type-Options: nosniff`, a `Content-Security-Policy` (the app needs no external origins at all, which makes a strict policy easy), `Referrer-Policy` |

### 0.3 Missing: a CLAUDE.md

You build this with Claude Code, and the architecture now has rules an agent can't infer from a single file it happens to open. Without them, the first "quick fix" puts a `localStorage` call in `domain/` or edits a shipped migration. Worth adding at the repo root:

```markdown
# personal-gtd — working agreements

## Commands
- `npm run verify` — typecheck + unit tests + build. Run before every commit.
- `npm test` / `npm run test:e2e` — unit / browser tests.

## Layers (a test enforces this)
domain ← persistence ← store ← ui
- `domain/` is pure: no window, document, localStorage, Date.now() or crypto
  calls inside functions. Time and ids are passed in as arguments.
- `store/` holds all persistence policy and the only mutable state.
- `ui/` renders state and dispatches commands. It never decides policy.

## Rules that are easy to break
- Every user-facing string lives in `src/ui/copy.ts`. The store and domain
  return data (a reason, a Problem), never a sentence.
- A migration that has shipped is never edited, only followed by a new one.
  Every migration gets a fixture test.
- Adding an OPTIONAL field needs no schema bump: bumping makes older builds
  read-only. Only bump when existing data must be transformed.
- Deletions are tombstones (`deletedAt`), never removals. Every change bumps
  `updatedAt`; merge depends on it.
- Operations return failures as values; they don't throw for anything a user
  can cause.
- NLDD interop: register components before the first render; booleans are
  `attr={cond || undefined}`, never `false`; custom-event handlers are
  lowercase (`ondismiss`). New `<nldd-*>` tag → add its import to
  `src/ui/nldd.ts` (a test fails otherwise).

## Why it is like this
See `docs/step-*.md`. Read the relevant step before restructuring anything.
```

### 0.4 A docs index

With four step documents, add a short `docs/README.md`: what each step covers, that they are snapshots rather than living documentation, and which one to read for which question (data safety, the model and migrations, the UI and design system, the feature plan).

---

## 4.1 Clarify the inbox

**Job to be done.** "When fourteen things have piled up in my inbox, I want to be walked through them one at a time so I decide once per item, instead of re-reading the whole list and closing it again."

This is the heart of GTD and the app can't do it today: it shows a list and leaves the deciding to you.

**User journey.** The Inbox shows "Clarify 14 items" (or you press `p`). The pane then shows one item at a time:

1. *Is it actionable?* No → Trash, Someday/maybe, or (later) Reference.
2. Yes → *What's the very next physical action?* The title is editable right there, because "Mom's birthday" becomes "Call the bakery about a cake".
3. *Under two minutes?* → Do it now → Done.
4. Otherwise → Next action, or Waiting for (delegated), or Someday.

A counter shows "3 of 14". Every decision is one keystroke (`n` next, `w` waiting, `s` someday, `d` done, `t` trash, `e` edit). No confirmations, because Ctrl+Z undoes anything, including a wrong trash. Escape leaves; the flow simply continues from wherever the inbox now starts.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | one new operation: rename an item (non-empty title) |
| store | one new command wrapping it |
| ui | `/clarify` route; ClarifyPage and a decision card; `keys.ts` gains the decision keys; new strings |
| tests | rename operation; an end-to-end pass through three items including an undo |

**Architecture notes.**

- **Don't store where you are in the flow.** "The item being clarified" is the first inbox item: derived state. Persisting a cursor would create a second source of truth that can point at a deleted item.
- **Shortcuts now need scope.** `d` means "done" only inside the flow. `keys.ts` grows a scope argument ("global" / "clarify"), which keeps the rules pure and testable rather than scattering key handling through components.

**Packages / switches.** None. New NLDD components: a progress or step indicator, a button bar, and the "just in time education" component for the two-minute-rule hint.

---

## 4.2 Projects

**Job to be done.** "When something takes more than one action, I want the outcome and its actions kept together, and I want to be told which projects have no next action — because those are the ones that quietly stop moving."

That last part is the single most valuable query in GTD, and it's impossible today.

**User journey.** During clarify (or from any item) you choose "Make this a project": the item becomes a project, and you're asked for its first next action. Projects appear in the sidebar with a count. A project page shows the outcome, its actions, and lets you add another. Next-action rows show a small project chip, so you can see what a task belongs to. A "Stalled" section lists active projects without a next action; completing the last action of a project puts it there immediately, which is the nudge the whole method depends on.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | a `Project` record (title, outcome, status, timestamps, tombstone); items gain an optional project reference; project status transitions; queries: actions in project, stalled projects, progress; operations: create, rename, set status, assign, and "promote an item to a project" |
| persistence | **migration to schema v3**: the document gains a projects collection; items are untouched. Fixture test |
| store | commands for the new operations; state now holds two collections |
| ui | `/projects` and `/projects/:id` routes; sidebar entry; project page; project chip in rows; capture syntax `+project` |
| tests | migration fixture; a truth table for "stalled"; the promote operation; an end-to-end project lifecycle |

**Architecture notes.**

- **This is the one real refactor in step 4.** Until now the store's state was a single array of items. Undo (`diff`/`revert`) and merge work on "records with an id and `updatedAt`", so both generalise to "per collection" rather than needing per-feature code. Do that generalisation deliberately, in its own commit, with the existing tests as the safety net. Everything after 4.2 then adds collections for free.
- **Backups follow automatically.** A backup file wraps the whole stored document (step 2, section 2.5), so projects are exported and migrated without touching the backup format. This is the payoff of that decision.
- **`+project` in the capture parser** matches an existing project by name case-insensitively, and creates one otherwise. Keep the parser pure: it returns "a project named X", and the operation decides whether that's an existing id or a new record.
- Prefer **one project per action** (a reference on the action) over a list. GTD wants an action to serve one outcome; a list invites ambiguity about which project is stalled.

**Packages / switches.** None. New NLDD components: tree-type list (project with its actions), a combo box to pick a project, breadcrumbs, description and title cells.

---

## 4.3 Time: defer and due dates

**Job to be done.** "When something can't start until next week, I want it out of sight until then; when something has a real deadline, I want to see it before it's late. Otherwise I stop trusting my Next list."

**User journey.** An action can get a start date ("defer until") and a due date. Deferred actions disappear from Next actions and come back on their date. A new **Today** view lists what's due or newly available today, plus anything overdue, marked clearly. Today becomes the default view — it's the answer to "what now?", which is the question you open the app with.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | two optional date fields; an "is actionable today" rule that the Next query uses; queries: today, overdue, upcoming |
| persistence | **no migration**: optional fields are backward compatible (see the note below) |
| store | dates set through the existing update path |
| ui | `/today` route and new default; date fields in the item view; date chips and an overdue badge on rows; sidebar order |
| tests | date queries against a fixed "today"; an end-to-end defer-and-return |

**Architecture notes.**

- **Store date-only values as `YYYY-MM-DD` strings, not timestamps.** "Due Friday" is a calendar day, not an instant. A timestamp forces a timezone into data that has none, and it's how apps end up showing yesterday's date after a flight. Timestamps stay for `createdAt`/`updatedAt`/`completedAt`, which *are* instants.
- **"Today" is an argument, not a call to the clock.** The queries receive today's date the same way operations receive `now`. That's why they can be tested without mocking time, and why a date rollover at midnight is a re-render rather than a special case.
- **No optional-field migration.** Adding an optional field needs no schema bump, because a version bump makes older builds treat the data as unreadable (step 2, principle 4). It works only if code never rebuilds items from scratch — the operations copy items with a spread, so unknown fields survive a round trip through an older build. Worth stating in CLAUDE.md, which section 0.3 does.
- **Skip natural-language dates for now** ("next Tuesday" in the capture box). It needs a parsing library and locale rules, and guesses wrongly in exactly the cases that matter. A date picker is unambiguous; revisit once the rest is in daily use.

**Packages / switches.** None (`Intl.DateTimeFormat` handles display). New NLDD components: date field and date picker.

---

## 4.4 Contexts as records

**Job to be done.** "When I'm at my laptop with twenty minutes, I want to see only what I can actually do here — and when I rename a context, I want every action to follow."

**User journey.** Contexts become real things rather than free text on each item: filter Next actions by one, rename it in one place, merge two that mean the same ("home" and "Home"), and give an action more than one ("@calls" and "@home"). The capture box takes several `@` tags. The filter lives in the URL, so a filtered list can be bookmarked and survives a reload.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | a `Context` record; items reference contexts by id; operations: create, rename, merge, set an item's contexts; queries: by context, contexts in use |
| persistence | **migration to schema v4**: derive context records from the existing free-text values, case-insensitively deduplicated, and rewrite items to reference them |
| store | commands for the new operations |
| ui | filter control on lists; several tags per row; a context management surface; route parsing gains query parameters |
| tests | migration fixture with messy data ("Home", "home", trailing punctuation, empty); merge and rename; end-to-end filtering |

**Architecture notes.**

- **This is the riskiest migration in the plan** — the only one that rewrites existing item data rather than adding to it. Give it a fixture built from your real exported data, and remember the pre-migration copy that step 2 already writes (`gtd:pre-migration:v3:…`). Export before upgrading.
- **Filters belong in the URL.** Beyond bookmarking, it's the groundwork for saved views in 4.9: a saved view is then just a name plus a URL, not a second filtering mechanism.
- **4.3 and 4.4 are swappable,** but this order is deliberate: dates are additive and safe, contexts carry the rewriting migration. Do the safe one first while you're still getting used to the migration machinery.

**Packages / switches.** None. New NLDD components: token field, segmented control, sheet.

---

## 4.5 The weekly review

**Job to be done.** "Once a week I want a guided pass over everything, so I can close the laptop believing the system is complete — which is the only reason the rest of it works."

**User journey.** A Review page walks through the standard pass, each step showing the relevant list and a "done" tick:

1. Empty the inbox (links into the clarify flow).
2. Projects without a next action.
3. Waiting-for items older than a week — the ones you should chase.
4. Someday items untouched for months — promote or drop.
5. What you completed this week (this is the part that makes the review feel worth doing).
6. Export a backup, as the closing step.

Finishing records the date, and the sidebar shows "Reviewed 9 days ago" when it's overdue.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | queries: stale waiting-for, untouched someday, completed in a period; per-project "last reviewed" |
| persistence | a small settings section in the document (additive, no migration) |
| store | settings commands |
| ui | Review page with progress; sidebar nudge |
| tests | the three queries; an end-to-end review pass |

**Architecture notes.**

- **Introduce app settings now, properly.** This is the first state that isn't an item, and there's already a stray one: `gtd:lastExportAt` sits in its own localStorage key from step 1. Move it into the document's settings so it's exported, migrated and merged like everything else — and so the review's "export a backup" step can actually check it.
- **The review is only queries and layout.** No new entity, no migration. That's the clearest evidence that "views are queries over one data set" (step 2, section 2.2) was the right call: the most valuable screen in the app is nearly free.

**Packages / switches.** None. New NLDD components: step indicator, form-type list for the checklist, progress circle.

---

## 4.6 Notes and an item detail pane

**Job to be done.** "When an action needs context — a link, a phone number, what I already tried — I want it on the item, so I'm not digging through email to start a five-minute task."

**User journey.** Select a row and a detail pane opens beside the list (the split view's inspector pane already exists in the shell from step 3). It shows title, project, contexts, dates and notes, all editable in place. On a narrow window the pane becomes a sheet by itself.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | an optional notes field |
| persistence | nothing (additive) |
| store | notes set through the existing update path |
| ui | inspector components; selection carried in the URL; rows become selectable while their buttons keep working |
| tests | end-to-end: select, type notes, reload, still there |

**Architecture notes.**

- **A row that is both a target and a container of buttons** is exactly the case NLDD's row segments are for: the row selects, the buttons still act, and it stays one tab stop. Don't nest a button inside a button.
- **Plain text with clickable links first, not markdown.** Rendering markdown means a parser and a sanitiser (two dependencies) and an injection surface. Linkified plain text covers "paste a URL and a phone number", which is what notes are actually for here.
- **This is what pushes storage past localStorage.** Notes are unbounded and the quota is about 5 MB for everything. It's the natural trigger for 4.8.

**Packages / switches.** None if notes stay plain text. New NLDD components: multi-line text field, rich text (for rendering), list item segment.

---

## 4.7 Recurring actions

**Job to be done.** "Some things come back every week — the bins, the backup, the review itself. I want them to reappear on their own, without cluttering my lists with twelve copies."

**User journey.** An action can repeat ("every week", "every 3 months", "every first Monday"). Completing it creates the next occurrence with a new date; the completed one stays in Done as a record. A recurring action shows a small repeat marker.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | a recurrence rule on an item; a pure "next occurrence" function; completion generates the successor |
| persistence | nothing (additive) |
| store | the complete command may now produce two changes, which undo already handles as one step |
| ui | a recurrence editor in the detail pane; a marker on rows |
| tests | the next-occurrence function (month ends, leap days, "every first Monday"); completing produces exactly one successor; undo removes it again |

**Architecture notes.**

- **Generate on completion, not on a schedule.** A local-first app has no background job: nothing runs while the tab is closed. Generating the successor when you complete the current one keeps it deterministic and keeps the rule in pure code.
- **Choose between "repeat from the due date" and "repeat from when I actually did it"** and store which. Watering plants repeats from when you did it; rent repeats from the date. Getting this wrong is the most common complaint about recurring tasks in other apps.
- **Keep your own small rule format** rather than adopting iCalendar RRULE. You need a handful of shapes, and RRULE's full grammar (with timezones) is a library-sized problem. Note the limit in the code so a future you doesn't quietly grow half an RRULE parser.

**Packages / switches.** None, given a small rule format.

---

## 4.8 IndexedDB and the async repository

**Job to be done.** "I want the app to stay fast and never hit a limit, as years of completed items and notes pile up." Nothing visible changes; this is what keeps the rest possible.

**User journey.** On first load after the upgrade, a one-time move of the data happens with a brief notification. Afterwards, boot is a fraction of a second even with thousands of items, and notes no longer compete with everything else for a 5 MB budget.

**Impacted components.**

| Layer | Change |
|---|---|
| persistence | a second repository implementation on IndexedDB; the interface becomes async; cross-tab notification moves to `BroadcastChannel` |
| store | absorbs async — the command queue exists for exactly this |
| ui | a loading state for the first boot |
| tests | run one shared repository contract suite against both implementations |

**Architecture notes.**

- **This is the cash-in of step 3's queue.** With an async repository, "re-read → apply → save" spans awaits, and two quick clicks could interleave and break the step 1 guarantee. The queue already serialises commands, and `dispatch` already returns a promise, so no call site changes. It's worth reading step 3, section 2.6 again before starting: the whole reason it was deferred was to arrive after the queue.
- **Keep the localStorage copy** until an IndexedDB read has succeeded, exactly as `gtd:items` was kept in step 2. Rollback safety costs one key.
- **Write per record instead of the whole list.** That closes the last step-1 limitation (a failed save plus concurrent tabs) and makes notes cheap.
- **A shared contract test suite** for the two repositories is the honest way to know the new one behaves like the old one, and it costs one refactor of the existing tests.
- **Use the storage-estimate API** to warn before the browser starts evicting, rather than discovering it afterwards.

**Packages / switches.** `idb` (a thin promise wrapper over IndexedDB; Dexie is the bigger alternative, but its query layer duplicates what `domain/queries` already does) and `fake-indexeddb` as a dev dependency so the contract suite runs under `node --test`.

---

## 4.9 Search and saved views

**Job to be done.** "When I remember one word of something, I want to find it in a second. And when I keep building the same filter, I want to keep it."

**User journey.** `/` opens a search box over the app; typing narrows across all lists, including notes; Enter jumps to the item. Separately, any filtered list can be saved with a name ("@calls, due this week") and appears in the sidebar.

**Impacted components.**

| Layer | Change |
|---|---|
| domain | a search query with simple ranking (title before notes, prefix before substring) |
| persistence | saved views as records in the document (additive) |
| store | commands to save and remove a view |
| ui | search overlay; sidebar section for saved views |
| tests | ranking; an end-to-end search and a saved view |

**Architecture notes.**

- **A saved view is data, not code:** a name plus the filter state already encoded in the URL (4.4). That's why filters went into the URL, and it's what makes "perspectives" a ten-line feature instead of a subsystem.
- **No search index until it's needed.** Scanning a few thousand items per keystroke is well under a frame. Revisit when notes are long and numerous, and then measure before adding a dependency.

**Packages / switches.** None.

---

## 4.10 Installable app and hosting

**Job to be done.** "When something occurs to me on the tram, I want it captured in three seconds on my phone and in the same inbox I'll clarify at my desk."

**User journey.** Open the app on your phone, add it to the home screen, and it launches like an app, works offline, and keeps its data. On Android it can also appear in the share sheet, so a link or a piece of text can be sent straight to the inbox.

**Impacted components.**

| Layer | Change |
|---|---|
| build | a service worker and a web app manifest |
| ui | an "update available" prompt when a new version is deployed |
| ops | HTTPS hosting you can reach from your phone |
| tests | the phone Playwright project grows; offline load as a smoke test |

**Architecture notes.**

- **Installing is also the storage fix.** Safari deletes script-writable storage for sites unused for seven days, and home-screen web apps are exempt. Until then, exporting is the only protection (which is why step 1 put it in first).
- **HTTPS buys three things at once:** `crypto.randomUUID`, persistent-storage requests, and service workers. All three are currently unavailable when you open the app over plain HTTP on your LAN.
- **The update prompt and the "newer schema" lock interlock.** If a device runs an old build against data written by a new one, step 2's read-only mode already protects the data; the service-worker prompt is what gets the user out of that state. Wire them together deliberately: read-only because of a newer schema should suggest reloading.
- **Decide hosting before building this.** A home server behind a VPN, or a static host, are both fine; they differ in whether the app is reachable when you're out, which is the whole point.

**Packages / switches.** `vite-plugin-pwa` (service worker and manifest generation). This is also the moment to add Firefox and WebKit Playwright projects, since WebKit is what your phone runs.

---

## 4.11 Sync, if and when

Not a plan — a decision sketch, deliberately last.

**What the groundwork already gives you:** stable UUIDs, `updatedAt` on every record, tombstones instead of deletions, a tested merge with "newest wins", a repository seam, and a command queue. That's most of what any sync approach needs.

**What's missing** is a transport and a conflict policy finer than per-record. Three options, in ascending cost:

1. **Export/import by hand** (what you have). Fine for occasional transfer between two browsers; merge already makes it safe and idempotent.
2. **A small self-hosted API** with a per-record change log, which fits the Docker and Kubernetes shape you already build. You'd own accounts, auth and backups.
3. **A CRDT library** (Automerge, Yjs) plus a sync server. Correct concurrent editing with no per-field policy of your own, at the cost of a new data representation and a much bigger dependency.

**Recommendation:** stay on option 1 until the phone is in daily use and you notice the friction. Adopt option 2 only for the data, not the UI; the local-first architecture should keep working with no network.

---

## What this adds up to

| Increment | Schema | Migration? | New packages | Roughly |
|---|---|---|---|---|
| 4.1 Clarify flow | v2 | no | — | an evening |
| 4.2 Projects | v3 | yes | — | the biggest one: entity + the collection generalisation |
| 4.3 Dates and Today | v3 | no (additive) | — | an evening |
| 4.4 Contexts as records | v4 | yes, rewriting | — | a careful evening |
| 4.5 Weekly review | v4 | no (additive settings) | — | an evening |
| 4.6 Notes and detail pane | v4 | no (additive) | — | an evening |
| 4.7 Recurring actions | v4 | no (additive) | — | mostly the date rules |
| 4.8 IndexedDB | v4 | storage engine, not schema | `idb`, `fake-indexeddb` | a weekend |
| 4.9 Search and saved views | v4 | no (additive) | — | an evening |
| 4.10 Installable app | v4 | no | `vite-plugin-pwa` | a weekend plus hosting |

**Deliberately not in the plan:** calendar and email integration, time tracking, collaboration or sharing, tags beyond contexts, and analytics. Each would double the data model, and none of them is why you'd open this app.

**What to watch for as it grows:**

- **Keep the layering.** Every increment above touches `domain/` first and `ui/` last. The moment a feature starts in a component, the test suite stops being able to protect it.
- **One migration per change, never edited afterwards,** each with a fixture built from real exported data.
- **Every new view is a query**, not a new stored list. If you find yourself storing something that could be computed, that's the signal to stop and look again.
- **The unit tests should stay the fast majority.** Playwright is for wiring; if you find yourself testing a rule through the browser, the rule is in the wrong layer.
