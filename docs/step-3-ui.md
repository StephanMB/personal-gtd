# Step 3: The UI, on Vite, Preact and NLDD

Implementation guide for `personal-gtd`, step 3 of the refactoring plan. It follows [`step-1-data-safety.md`](step-1-data-safety.md) and [`step-2-groundwork.md`](step-2-groundwork.md) and assumes both are applied.

**Decisions this step implements** (settled beforehand):

| Topic | Decision |
|---|---|
| Devices | Desktop first; phone kept in mind, not built for yet |
| Build | Astro → **Vite** |
| UI | **Preact + signals** |
| State | A **store outside the framework**: commands, one-at-a-time queue, undo |
| Tests | **Playwright end-to-end** tests on top of the unit tests |
| Design system | **NLDD** (`@nldd/design-system`), as in regelrecht, *if it can be used* |

Section 0 answers that last question. The short answer is yes, with three conditions.

**What this step deliberately doesn't do:**

- no new GTD features: projects and contexts as records are step 4
- no IndexedDB
- no installable app (PWA) or HTTPS hosting

The store is built so that each of these slots in later without touching the UI.

**How to use this document.** Work through it in order. Each section is one commit and says what to change, why, and how to check it. The appendix has every new or changed file in full. *Verification status* at the end separates what I ran from what I couldn't. For this step that distinction matters more than before, because the real UI packages couldn't be installed where I wrote it.

---

## 0. Can NLDD be used? Yes, with three conditions

**What it is.**

- `@nldd/design-system` is the design system of the *Nederlandse Digitale Dienst*, published by MinBZK from the repository `MinBZK/storybook`.
- It's a library of web components built with Lit (`<nldd-button>`, `<nldd-list>`, …).
- The code is **EUPL-1.2**, an open-source licence that allows reuse.
- At the time of writing it's at version 0.8.87 (9 Sept 2026). Its `publiccode.yml` marks it as **beta**.
- regelrecht uses it in all three of its Vue front ends and in its Astro docs site.

**Why it's a good fit here, beyond consistency with your work:**

- **Keyboard and accessibility behaviour are built in.** `nldd-list` gives you arrow-key movement between rows and Tab through a row's buttons. You also get focus rings, correct ARIA, and support for high-contrast mode and reduced motion. For a desktop-first, keyboard-driven app, that's most of the work done.
- **Responsive layout is built in.** The navigation split view turns the sidebar into a sheet below 1008 px. That's the phone layout, ready when you want it (3.8).
- **Web components work with any framework.** That matches step 2's principle of keeping the UI layer replaceable: the components would survive a switch away from Preact.

**Condition 1: don't ship the Rijksoverheid font.** NLDD bundles *Rijksoverheid Sans*. Its licence (NOTICES.md) reserves it for publications of the Rijksoverheid and parties working on its behalf; other use needs written permission from the Rijksvoorlichtingsdienst. A personal app isn't a Rijksoverheid publication, and working for the government doesn't change that. NLDD's own documentation names the fix: import `@nldd/design-system/styles/system-font` instead of `/styles`. It's the same stylesheet without the `@font-face` rules, so the font never enters the page and everything falls back to the system font. **This is the one hard requirement.**

**Condition 2: don't wear the Rijksoverheid identity.**

- **Favicon.** The package's `favicon.svg` is the national coat of arms (*rijkswapen*) on lintblauw. Use your own icon; `public/favicon.svg` is a simple check mark.
- **Accent colour (my recommendation, not a licence condition).** NLDD's accent colour points at *lintblauw*, the Rijksoverheid blue. `theme.css` repoints it at another NLDD palette (violet). Reasons:
  - A personal tool that looks exactly like a government service invites confusion if you ever share a screenshot or a link.
  - It costs one CSS block, and every accent-coloured component follows.

  Remove the block if you'd rather have lintblauw.

**Condition 3: bring your own framework glue.** NLDD ships TypeScript types for Vue only, and regelrecht's patterns are Vue patterns. With Preact you need:

- a small JSX typing file (3.5)
- four interop rules (3.5)
- imperative notifications, because the notification element moves itself in the DOM (3.5)

This is manageable, but it's the part of this step with the least external evidence behind it.

**Also worth knowing:**

- **Versioning.** NLDD releases every change, breaking ones included, as a *patch* version. Before upgrading, read `CHANGELOG.md` for every version in between. The package's Claude Code skill says the same.
- **Language.** Built-in component strings (such as "Navigatie") default to Dutch and are overridden per component through `translations` or an attribute. This app keeps its own strings in English, all in `src/ui/copy.ts`. Switching the whole UI to Dutch is one file's work, and arguably fits NLDD better. That's your call.
- **Claude Code plugin.** NLDD's repository doubles as a Claude Code plugin (`/plugin marketplace add MinBZK/storybook`). It gives an agent the tags, attributes and patterns, and is useful if you build the next steps with Claude Code.

---

## End state

```text
index.html               NEW  Vite entry
vite.config.ts           NEW
playwright.config.ts     NEW
e2e/                     NEW  5 files, 14 end-to-end tests
public/favicon.svg       NEW  own icon (not the rijkswapen)
src/
  domain/                unchanged
  persistence/           unchanged
  store/                 NEW  store.ts, undo.ts (+ tests, test-helpers)
  ui/                    REPLACED
    main.tsx, App.tsx    entry and app shell
    components/          Sidebar, ListPage, ItemRow, CaptureForm, ProblemBanner, BackupPanel
    app-state.ts         store instance + signal bridge
    commands.ts          what buttons and shortcuts call
    router.ts, routes.ts History-API router; pure route parsing (+ test)
    keys.ts, shortcuts.ts pure shortcut rules (+ test); window wiring
    notify.ts            imperative nldd-notification
    copy.ts              every user-facing string
    nldd.ts              per-component NLDD imports (+ guard test)
    nldd-jsx.d.ts        Preact JSX types for <nldd-*>
    theme.css            accent colour + the few custom layouts
    download.ts, last-export.ts
  architecture.test.ts   EDIT  adds the store/ layer
package.json, tsconfig.json, nginx.conf   EDIT
.gitignore, .dockerignore                 EDIT  Playwright output
astro.config.mjs, src/pages/, src/styles/, .astro/   DELETED
```

**Suggested commit sequence:**

1. 3.2 store, with tests. Only adds code; the old UI keeps working.
2. 3.1 + 3.3 + 3.4 + 3.5 + 3.6 + 3.7 switch-over: Vite, Preact, NLDD, screens, shortcuts. This is necessarily one commit, because the old Astro page can't coexist with the new entry.
3. 3.9 Playwright.

---

## 3.1 Astro → Vite

**Why.** Astro's strengths (static pages, content collections, zero JavaScript by default) go unused in a client-side app. Vite is the build tool underneath Astro anyway, so this removes a layer rather than adding one. Docker still builds to `dist/`, and nginx still serves static files.

**Do this.**

1. Remove Astro: `npm uninstall astro`. Delete `astro.config.mjs`, `src/pages/`, `src/styles/` and `.astro/`.
2. Install the new packages **with npm, so it resolves current versions**:

   ```bash
   npm install preact @preact/signals @nldd/design-system
   npm install -D vite @preact/preset-vite @playwright/test
   npx playwright install chromium
   ```

   The version ranges in the appendix's `package.json` are what I expect. If npm picks newer ones, keep npm's. For `@preact/preset-vite`, check that the installed major version supports your Vite major (Vite 8 at the time of writing).
3. Add `index.html`, `vite.config.ts` and `public/favicon.svg`, and replace `package.json` scripts, `tsconfig.json` and `nginx.conf` (appendix).

**Details worth understanding:**

- **`tsconfig.json` is now self-contained.** Astro's base config is gone, so the strict settings are spelled out. Two are new:
  - `"jsx": "react-jsx"` with `"jsxImportSource": "preact"` compiles JSX to Preact without a `h` import in every file.
  - `"types": ["node", "vite/client"]` makes `import './theme.css'` type-check.
- **`build.cssTarget` in `vite.config.ts`.** NLDD's CSS relies on `light-dark()`, the Popover API and container queries. The CSS minifier "lowers" modern CSS for older browsers, and lowering these breaks them. Declaring modern browsers as the floor prevents that. regelrecht sets the same floor for the same reason.
- **nginx gets a single-page-app fallback:** `try_files $uri $uri/ /index.html`. Every path that isn't a file serves the app, and the router picks the view. Two cache fixes come with it:
  - Only `/assets/` (where Vite puts content-hashed files) is cached forever. Previously *every* `.js`, `.css` and `.svg` was marked immutable, including files whose names don't change.
  - `index.html` is always revalidated, so a deploy shows up immediately.
- **The dev server keeps port 4321,** so `.claude/launch.json` still works.

**Check.** `npm run dev` opens the app. `npm run verify` passes (typecheck → tests → build).

---

## 3.2 The store

The central piece of this step. `src/store/store.ts` is plain TypeScript: no Preact, no DOM (the architecture test now enforces that for `store/`).

```ts
interface Store {
  getState(): StoreState;              // { items, problem, unsaved, undoStack }
  subscribe(listener): () => void;
  dispatch(command): Promise<DispatchResult>;
  boot(): void;
  dismissProblem(): void;
  resumeSaving(): void;
}
type Command =
  | { type: 'capture'; input } | { type: 'move'; id; to } | { type: 'remove'; id }
  | { type: 'restore'; id } | { type: 'import'; items } | { type: 'undo'; entryId? };
```

**What moved here and why:**

- **All persistence policy from steps 1–2:**
  - re-read before write
  - memory wins while unsaved
  - quarantine, pause and read-only modes
  - the boot table

  Step 2's `app.ts` mixed that policy with rendering. Now the store decides and the UI only renders `state.problem` and `state.unsaved`. The benefit: every one of those rules is now covered by a Node test (`store.test.ts`) instead of by manual browser checks.
- **Problems are data, not sentences.** `Problem` is a tagged union (`{ kind: 'newer', version }`, …), and `copy.ts` words it. The store stays language-free, and a Dutch UI never touches it.

**The queue.** `dispatch` doesn't run a command straight away; it chains it onto a promise, so commands run strictly one after another. With today's synchronous localStorage this changes nothing observable. It's there for step 4+: once the repository becomes async (IndexedDB), "re-read → apply → save" spans several `await`s, and without a queue two clicks could interleave and undo step 1's guarantees. The queue makes the async switch an internal change. `dispatch` already returns a promise, so no caller changes.

**Generic undo** (`src/store/undo.ts`). No command has its own "inverse" code. The domain operations return new objects only for items they change (a step 2 property), so comparing object references before and after a command (`diff`) yields exactly what it did. Undo puts the "before" versions back (`revert`). Any command added in step 4 is undoable for free. Three rules:

- **Undo is a new change, not time travel.** Reverted items get `updatedAt = now`, so merges and future sync treat the undo as the newest version. Undoing a capture leaves a tombstone, like any delete.
- **Undo refuses rather than overwrites.** If an affected item changed since (typically in another tab), it returns `undo-conflict` instead of silently discarding that later change.
- **Rebasing.** Because undo bumps `updatedAt`, the *next-older* undo entry would see "changed since" and refuse, a false conflict with itself. **The first version of this code had exactly this bug; the store test caught it.** `rebase()` points the remaining entries at the restored versions, so undoing several times in a row works.

The stack is per tab, in memory, capped at 50. `{ type: 'undo', entryId }` undoes one specific entry: the notification's Undo button uses it, so it undoes *that* delete even if you did something else in between. Ctrl/⌘+Z undoes the latest. There's no redo yet.

**Cross-tab updates.** These still come from `repository.subscribe()` (the `storage` event), and the store queues the refresh like a command. The IndexedDB repository will implement the same `subscribe` with `BroadcastChannel`, since IndexedDB has no storage event. The store doesn't change.

**Check.** `npm test`. The 15 store and undo tests cover:

- round trips through storage
- ordering in the queue
- stale tabs
- undo conflicts, entry-targeted undo, double undo, and the undo limit
- a save failure with memory staying ahead, then recovery
- quarantine, pause and resume, the newer-schema lock, legacy migration, and unavailable storage
- undoable import
- subscriptions

---

## 3.3 Preact and signals

**Why signals.** A signal is a value that knows who reads it. `app-state.ts` puts the store's state in one signal, and a component that reads `appState.value` re-renders when it changes, and only then. `lists` is a `computed` signal (items grouped per list), recalculated only when the items change. This is what fixes the step 1–2 annoyance of every action rebuilding the whole page and resetting which sections are open and where focus is.

**The seams:**

- **`app-state.ts`** is the *only* file that calls `store.subscribe`. It creates the store, boots it before the first render, and mirrors its state into the signal. It also registers the close-tab warning (`beforeunload`) for unsaved changes.
- **`commands.ts`** is what buttons and shortcuts call. Each function dispatches a store command and turns a failure into a notification (`deleteItem`, `undoLast`, `importFile`, `exportData`, …). Components never touch the store directly, so "what does this button do" is readable in one file.
- **`copy.ts`** holds every string. `satisfies Record<CommandFailure, string>` makes a new failure reason without a message a type error.

**The router** (`router.ts`, about 20 lines) is a signal holding `location.pathname`, updated on `pushState` and `popstate`. `routes.ts` (pure, tested) maps paths to views: `/inbox`, `/next`, `/waiting`, `/someday`, `/done`; `/` goes to Inbox and anything unknown redirects there.

*Why not a routing library:* there's one route shape. Also, NLDD's navigation rows render their `<button>` inside a shadow root, where routers that intercept `<a>` clicks can't see it. Step 4 adds `/projects/:id` with two lines in `parseRoute`.

---

## 3.4 NLDD setup

1. **`src/ui/nldd.ts`** imports the stylesheet **without the Rijksoverheid font** (`styles/system-font`, see condition 1) and then one entry point per component used.

   *Why not `import '@nldd/design-system'`:* that registers all ~110 components, and the app uses 23.
2. **The guard: `nldd-imports.test.ts`.** A `<nldd-*>` tag whose component was never imported renders as an unknown, empty element, with no error. The test scans `src/ui` for `<nldd-…>` tags and `createElement('nldd-…')`. It maps each tag to its package entry point (sub-components live in their parent's entry) and fails on anything used but not imported, or imported but unused. It's the same guard regelrecht runs as a script, written here as a test so `npm test` covers it.
3. **`theme.css`**:
   - the accent remap (condition 2): 25 lines, all pointing at one palette; replace `violet` with `mosgroen`, `hemelblauw`, … to taste
   - the two custom layouts (capture row, backup note), using NLDD's `--primitives-*` tokens, never raw values

   NLDD's rule is *compose, don't restyle*: pick a different component rather than overriding one's internals.
4. **`public/favicon.svg`**: your own icon (condition 2).

**Light and dark** follow the operating system automatically: NLDD's palette is built on `light-dark()`, and `index.html` declares `color-scheme: light dark`. Your old `global.css` dark-mode block is no longer needed.

---

## 3.5 Preact × web components: the rules

This is where most of the risk sits, so the rules are explicit. They come from how Preact applies props to DOM elements and how NLDD components behave.

1. **Register components before the first render.** Preact sets a prop as a *property* if the element has it (`'number' in element`), and as an *attribute* otherwise. An element that isn't registered yet has none of its properties, so everything becomes attributes and camelCase props silently break. `main.tsx` therefore imports `nldd.ts` first. ES modules evaluate imports in order, so all elements are defined before `render()`.
2. **Booleans: pass `true` or `undefined`, never `false`.** Write `selected={isCurrent || undefined}`, which is the same pattern regelrecht uses in Vue. The trap: Preact writes `false` as the *string* `"false"` for any attribute whose 5th character is `-` (it's meant for `aria-*` and `data-*`). So `full-width={false}` or `hide-back={false}` would set the attribute, and a Lit boolean attribute that's present means **true**.
3. **Custom events: lowercase prop names.** Preact derives the event name from the prop. For names the DOM doesn't know, it keeps the casing, so `onDismiss` listens for an event called `Dismiss`, which never fires. Write `ondismiss`, `onback`. Standard events (`onClick`, `onInput`, `onChange`) are fine in camelCase. Values arrive in `event.detail?.value`, or read the element's `.value`.
4. **Don't let NLDD move elements that Preact owns:**
   - `nldd-notification` relocates itself into a shared region, which would break Preact's bookkeeping of the original parent's children. So `notify.ts` creates notifications with `document.createElement`, outside the component tree. That also matches what a toast is: fired from anywhere.
   - `nldd-form` in its default mode moves its children into an inner `<form>`. Use a plain `<form>` (as `CaptureForm` does) or NLDD's documented "user-provided form" mode.

**Forms.** From NLDD 0.8.81, `nldd-text-field` and `nldd-button type="submit"` are form-associated, so Enter in the field and a click on the button both submit a surrounding `<form>`. (A comment in regelrecht's `SignupForm.astro` says the button is *not* form-associated; that predates 0.8.81.) `CaptureForm` keeps the field uncontrolled: it reads `.value` on submit and sets it to `''` after, which avoids re-rendering on every keystroke. `.focus()` on the field and on list rows focuses the inner control; both components provide it.

**Types: `nldd-jsx.d.ts`.** NLDD's components declare themselves in `HTMLElementTagNameMap`, so every tag and its element class are known to TypeScript. The file maps them into Preact's `IntrinsicElements`. Each tag accepts:

- **its own properties, typed from its class:** `size={5}` on a button or `variant="loud"` on a banner is a type error, as is an unknown tag
- **any kebab-case attribute** (`supporting-text`): not checked by name, the price of not maintaining 110 component signatures by hand
- **lowercase event handlers** (`ondismiss`)

The element's own props override same-named generic HTML attributes. Without that, NLDD's `size="sm"` would collide with HTML's numeric `size` attribute.

---

## 3.6 The screens

The layout follows NLDD's *app-shell* pattern: `nldd-app-view` → `nldd-navigation-split-view` → `nldd-split-view-pane` → `nldd-page`.

- **Sidebar (primary pane).**
  - An `nldd-list type="navigation"`, one button row per list: icon, name, count and shortcut key. `selected` on the current row gives screen readers `aria-current="page"`.
  - The count is an `nldd-badge`: "how much of something there is", in the accent colour for Inbox, because GTD wants it empty.
  - An `nldd-skip-link` wraps the navigation so keyboard users can jump past it.
  - Export/import sits at the bottom.
- **List page (main pane).** A title bar, the problem banner (if any), the capture form, then the items. Capture is on every list, not only the Inbox: in GTD you capture whenever something comes up. When you're not on the Inbox, a notification confirms where it went.
- **Item row.** The row isn't an action itself; its buttons are.
  - `nldd-list` then provides the keyboard: ↑/↓ move between rows, Tab walks the current row's buttons, Esc returns to the row.
  - The context is an `nldd-tag`, which NLDD defines as "a property someone assigned", as opposed to a badge.
  - Move buttons come from `TRANSITIONS`, as before. Their accessible names include the title ("Next: Call dentist"), so a screen reader doesn't hear ten identical "Next" buttons.
- **Feedback.**
  - **Storage problems** get an `nldd-banner`: it stays in the page until resolved.
  - **Confirmations and failures** get an `nldd-notification`: they float, stack and leave on their own. Critical ones stay.
- **No confirmation dialogs.** Import now happens immediately, with Undo in the notification, instead of step 1's `window.confirm`. That's NLDD's own guideline ("undo over confirm; a modal only for irreversible actions"), made possible by the store's generic undo.

---

## 3.7 Keyboard (desktop first)

| Keys | Action | Where it comes from |
|---|---|---|
| `c` | Focus the capture field | `keys.ts` |
| `1` … `5` | Inbox, Next, Waiting, Someday, Done | `keys.ts`, shown in the sidebar with `nldd-keyboard-shortcut` |
| Ctrl/⌘ + `Z` | Undo the last change | `keys.ts` |
| ↑ ↓ Home End | Move between rows | NLDD `nldd-list` |
| Tab / Esc | Into a row's buttons / back to the row | NLDD `nldd-list` |
| Enter | Submit capture | NLDD form association |

**Rules** (pure, tested in `keys.test.ts`):

- Single keys never fire while you're typing.
- Ctrl+Z doesn't fire while typing either: inside a text field it belongs to the field's own text undo.
- Shift+Ctrl+Z is left alone, reserved for redo.
- `shortcuts.ts` decides "typing" from `event.composedPath()[0]`. Inside an NLDD field, `event.target` is the host element, not the real `<input>` within its shadow root.

---

## 3.8 Phone in mind

**What's already there, at no extra cost:**

- Below 1008 px the navigation split view shows the sidebar as a sheet, and the list takes the full width.
- Notifications span the top edge on small screens.
- `nldd-keyboard-shortcut` hides itself on touch-only devices.
- `enter-key="done"` labels the phone keyboard's Enter key.
- A `phone` Playwright project runs the tests tagged `@phone` at Pixel 7 size with touch.

**What's deliberately deferred,** and why it waits: *installable offline app + HTTPS hosting*. This is what makes phone capture practical, and it also removes Safari's 7-day storage deletion. It's a hosting decision first (where does it run on HTTPS?) and a small build addition second (a manifest and service worker). It fits naturally with step 4's IndexedDB move.

---

## 3.9 Playwright end-to-end tests

**Why these on top of 72 unit tests:** the unit tests cover the logic. What they can't see is the *wiring*:

- that tags are upgraded (imported)
- that Preact sets props correctly on web components (3.5)
- that Enter submits
- that the router, notifications and cross-tab refresh work in a real browser

Those are exactly the parts I couldn't run while writing this step.

**Configuration choices** (`playwright.config.ts`):

- **Test the production build** (`vite build && vite preview`), not the dev server. That's what nginx serves, and CSS-lowering or import problems only show up there.
- **Every test gets a fresh browser context,** so localStorage starts empty and tests can run in parallel.
- **Wait for conditions, never for fixed times.** Every wait is `expect(...).toBeVisible()`, which retries until true. regelrecht's own Playwright config notes that its suite "leans on fixed wait times" and is flaky under parallel load. Don't inherit that.
- **Find things by role and accessible name** (`getByRole('button', { name: 'Next: Call dentist' })`), the way a user or screen reader would. Playwright sees through open shadow roots, so this works across NLDD's components without depending on their internals. As a bonus, a missing accessible label makes a test fail.
- **Two projects:** `desktop` runs everything; `phone` runs only `@phone` tests.

**The 14 tests:**

| File | Covers |
|---|---|
| `capture.spec.ts` | capture with context (`@phone`); the Add button (`@phone`); email addresses stay intact; `c` shortcut |
| `workflow.spec.ts` | clarify → Next → Done via sidebar and keys, then Ctrl+Z; delete + Undo from the notification; URL routing, unknown paths, Back button |
| `persistence.spec.ts` | survives reload; step 1 data upgraded; second tab sees captures; newer-schema read-only; corrupt data quarantined and app keeps working |
| `backup.spec.ts` | export → wipe → import → undo import; non-backup file refused |

**Run:** `npm run test:e2e` builds, starts a preview server and runs both projects. Add `--ui` for Playwright's interactive mode.

Also add `test-results/` and `playwright-report/` to both `.gitignore` and `.dockerignore`.

**CI** (extends step 2's workflow, if you use GitHub):

```yaml
      - run: npm ci
      - run: npm run verify
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

End-to-end tests stay out of the Docker build: they need a browser, and the image shouldn't.

---

## 4. Tests after this step

| Suite | Count | Runs in | What it guards |
|---|---|---|---|
| domain + persistence (step 2) | 47 | `npm test`, Docker | rules, migrations, merge, storage formats |
| store + undo | 15 | `npm test`, Docker | persistence policy, queue, undo |
| ui: routes, keys, NLDD imports | 6 | `npm test`, Docker | URL scheme, shortcut rules, no un-imported tags |
| architecture | 4 | `npm test`, Docker | domain ← persistence ← store ← ui |
| Playwright | 14 | `npm run test:e2e`, CI | the wiring in a real browser |

---

## 5. Known limitations (for step 4 and later)

- **No redo;** undo history is per tab and lost on reload. A persistent history would come naturally with an operation log, if sync ever needs one.
- **The storage-event cross-tab refresh stays** until the IndexedDB repository brings `BroadcastChannel`.
- **Rows are buttons, not links,** so middle-click or "open in new tab" on a sidebar list doesn't work. That's acceptable for five fixed lists. Revisit when projects get their own pages.
- **English UI with Dutch component defaults** where a component shows its own text and no override is set. Check the sheet and close labels when the phone layout gets attention.
- **NLDD is beta, with weekly patch releases** that can include breaking changes. Upgrade deliberately (read the changelog) and let the guard test and Playwright catch the rest.
- **Tests still only cover Chromium.** Add Firefox and WebKit projects when the phone work starts (WebKit ≈ Safari).

---

## 6. Verification status

**Ran and passed:**

- **Unit tests:** all 72 pass on Node 22 with native type stripping:
  - step 2's 47
  - 15 store and undo tests
  - 6 UI tests (routes, shortcut rules, NLDD import guard)
  - the architecture test, now with the store layer
- **Store bug found and fixed.** Writing the store tests surfaced the double-undo false conflict described in 3.2.
- **Import guard, against NLDD's real `package.json`.** It passes for the imports in `nldd.ts`, and removing one import makes it fail as intended.
- **Every NLDD fact in this guide was read from its source repository at v0.8.87:**
  - the font licence and the `system-font` stylesheet
  - that the favicon is the rijkswapen
  - component attributes and events
  - form association from 0.8.81
  - how the notification relocates itself
  - focus delegation
  - the entry point for every component imported
- **Type check,** with strict settings, including the e2e specs against Playwright's real types. **Caveat:** Preact, `@preact/signals`, Vite and NLDD's own type declarations couldn't be installed, so the UI was checked against minimal stand-in declarations shaped like the real ones. The JSX typing layer behaves as intended there: wrong prop types, unknown variants and unknown tags are rejected; kebab attributes and lowercase handlers are accepted.

**Not verified, so do these once, in this order:**

1. **`npm install`** (3.1), then **`npm run typecheck`** against the real types. The most likely friction is the JSX augmentation in `nldd-jsx.d.ts`: I used the `declare global { namespace preact.JSX … }` form Preact documents for custom elements. If `tsc` reports that `nldd-*` elements don't exist on `IntrinsicElements`, switch to `declare module 'preact' { namespace JSX { … } }`. The rest of the file stays as it is.
2. **`npm test`**: the NLDD import guard now runs against the installed package.
3. **`npm run dev`** and look: layout, sidebar, capture, notifications. The UI code has never run in a browser.
4. **`npm run test:e2e`**: this is the real check of 3.5's interop rules. A failing locator most likely means an accessible name differs from what I derived from NLDD's docs (for example, how a `nldd-list` label or a notification's Undo button is exposed). Adjust the locator, not the app, unless the app is actually inaccessible.
5. **`docker build .`**: `verify` now includes the Vite build.

Package versions are ranges I expect but couldn't confirm (the npm registry wasn't reachable from where I worked). Trust what `npm install` resolves.

---

## Appendix: files

Unchanged from step 2: `src/domain/*`, `src/persistence/*`, `Dockerfile`. `src/ui/download.ts` is carried over unchanged.

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
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "node --test \"src/**/*.test.ts\"",
    "test:watch": "node --test --watch \"src/**/*.test.ts\"",
    "test:e2e": "playwright test",
    "verify": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "@nldd/design-system": "^0.8.87",
    "@preact/signals": "^2.3.0",
    "preact": "^10.27.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@preact/preset-vite": "^2.10.0",
    "@types/node": "^24",
    "typescript": "^7.0",
    "vite": "^8.2.2"
  }
}
```

### `tsconfig.json`

```jsonc
{
  // Own strict config now that Astro's base config is gone.
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    // Imports carry explicit .ts extensions so Node can run tests without a bundler.
    "allowImportingTsExtensions": true,
    // Forbid syntax Node's type stripping can't erase (enums, namespaces, parameter properties).
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    // NLDD's CSS relies on light-dark(), the Popover API and container
    // queries. Tell the CSS minifier those browsers are the floor so it
    // doesn't "lower" them into something broken (same floor as regelrecht).
    cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari18'],
  },
  // Same port as before, so .claude/launch.json keeps working.
  server: { port: 4321 },
});
```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Personal GTD</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ui/main.tsx"></script>
  </body>
</html>
```

### `nginx.conf`

```nginx
server {
    listen 8000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;
    absolute_redirect off;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Single-page app: every path that is not a file gets index.html, and the
    # client-side router picks the view (/inbox, /next, ...).
    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html must always be revalidated, or a deploy is invisible until
    # the cache expires.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # Vite puts content-hashed files in /assets/: safe to cache forever.
    # (Previously every .js/.css/.svg was immutable, including the unhashed favicon.)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /health {
        access_log off;
        default_type text/plain;
        return 200 "OK";
    }
}
```

### `public/favicon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#6b3fa0"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

### `.gitignore` and `.dockerignore`: add

```gitignore
test-results/
playwright-report/
```

### `src/architecture.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the layering: domain <- persistence <- store <- ui.
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
  store: {
    mayImport: ['domain', 'persistence', 'store'],
    forbiddenGlobals: /\b(window|document|localStorage|sessionStorage|navigator|preact)\b/,
  },
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

### Store

#### `src/store/store.ts`

```ts
import type { Item, Status } from '../domain/model.ts';
import { capture, move, remove, restore, purgeTombstones, type OpFailure, type OpResult } from '../domain/operations.ts';
import { mergeItems } from '../domain/merge.ts';
import { newId as defaultNewId } from '../domain/ids.ts';
import { DATA_KEY, LEGACY_KEY, type Repository } from '../persistence/repository.ts';
import { SCHEMA_VERSION } from '../persistence/schema.ts';
import { diff, rebase, revert, type Change } from './undo.ts';

/**
 * The application store: the one place where state changes.
 *
 * - Framework-free (no Preact, no DOM), so it is tested with node:test and the
 *   UI framework stays replaceable. The architecture test enforces this.
 * - Every command runs through a queue, one at a time. With today's
 *   synchronous repository that changes nothing; it is what keeps "re-read,
 *   apply, save" atomic once the repository becomes async (IndexedDB).
 * - Persistence policy from steps 1 and 2 (quarantine, pause, read-only,
 *   unsaved) lives here now, not in the UI. The UI renders `problem` and
 *   `unsaved`; it decides nothing.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'capture'; input: string }
  | { type: 'move'; id: string; to: Status }
  | { type: 'remove'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'import'; items: Item[] }
  /** Undo the latest change, or a specific one (the toast's Undo button). */
  | { type: 'undo'; entryId?: number };

export type CommandFailure = OpFailure | 'nothing-to-undo' | 'undo-conflict';

export type DispatchResult =
  | { ok: true; entryId: number | null; counts?: { added: number; updated: number; deleted: number } }
  | { ok: false; reason: CommandFailure };

/** Something the user needs to know about storage. Data, not wording: the UI words it. */
export type Problem =
  | { kind: 'unreadable-items'; count: number; copyKey: string }
  | { kind: 'corrupt'; copyKey: string | null; leftInLegacy: boolean; raw: string }
  | { kind: 'paused'; cause: 'corrupt' | 'unreadable-items' | 'migration'; raw: string }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable' }
  | { kind: 'save-failed' };

export interface UndoEntry {
  id: number;
  command: Command;
  changes: Change[];
}

export interface StoreState {
  /** All items, tombstones included. Views go through domain/queries. */
  readonly items: readonly Item[];
  readonly problem: Problem | null;
  /** Changes exist that are not in storage. The UI warns before closing. */
  readonly unsaved: boolean;
  /** Newest last. Per tab, in memory. */
  readonly undoStack: readonly UndoEntry[];
}

export interface Store {
  getState(): StoreState;
  subscribe(listener: (state: StoreState) => void): () => void;
  dispatch(command: Command): Promise<DispatchResult>;
  /** Read storage and apply the load policy. Call once, before rendering. */
  boot(): void;
  dismissProblem(): void;
  /** Leave paused mode after the user downloaded the unreadable data. */
  resumeSaving(): void;
}

export interface StoreOptions {
  repository: Repository;
  now?: () => number;
  newId?: () => string;
  undoLimit?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const BLOCKING: ReadonlySet<Problem['kind']> = new Set(['paused', 'newer', 'unavailable']);

export function createStore({ repository: repo, now = Date.now, newId = defaultNewId, undoLimit = 50 }: StoreOptions): Store {
  let state: StoreState = { items: [], problem: null, unsaved: false, undoStack: [] };
  const listeners = new Set<(state: StoreState) => void>();
  let queue: Promise<unknown> = Promise.resolve();
  let nextEntryId = 1;

  function set(patch: Partial<StoreState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  const canWrite = () => !(state.problem && BLOCKING.has(state.problem.kind));

  /** Serialize work. A failing job must not block the ones behind it. */
  function enqueue<T>(job: () => T | Promise<T>): Promise<T> {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Adopt storage when it is safe: never over memory that is ahead of it. */
  function refresh(): void {
    if (!canWrite() || state.unsaved) return;
    const fresh = repo.load();
    if (fresh.kind === 'ok' && fresh.invalid === 0 && fresh.from === SCHEMA_VERSION) set({ items: fresh.items });
    else if (fresh.kind === 'empty' && state.items.length > 0) set({ items: [] });
  }

  /** Commit `items` (plus any other state) and write it, reporting failure as a Problem. */
  function save(items: readonly Item[], patch: Partial<StoreState> = {}): void {
    if (!canWrite()) {
      set({ ...patch, items, unsaved: true });
      return;
    }
    const result = repo.save([...items]);
    if (result.ok) {
      const problem = state.problem?.kind === 'save-failed' ? null : state.problem;
      set({ ...patch, items, unsaved: false, problem });
    } else {
      set({ ...patch, items, unsaved: true, problem: { kind: 'save-failed' } });
    }
  }

  function apply(command: Exclude<Command, { type: 'undo' } | { type: 'import' }>, items: Item[]): OpResult {
    const t = now();
    switch (command.type) {
      case 'capture':
        return capture(items, command.input, newId(), t);
      case 'move':
        return move(items, command.id, command.to, t);
      case 'remove':
        return remove(items, command.id, t);
      case 'restore':
        return restore(items, command.id, t);
    }
  }

  function run(command: Command): DispatchResult {
    refresh();
    const before = [...state.items];

    if (command.type === 'undo') {
      const stack = state.undoStack;
      const entry = command.entryId === undefined ? stack.at(-1) : stack.find((e) => e.id === command.entryId);
      if (!entry) return { ok: false, reason: 'nothing-to-undo' };
      const reverted = revert(before, entry.changes, now());
      if (!reverted.ok) return reverted;
      save(reverted.items, { undoStack: rebase(stack.filter((e) => e !== entry), reverted.restored) });
      return { ok: true, entryId: null };
    }

    let after: Item[];
    let counts: { added: number; updated: number; deleted: number } | undefined;
    if (command.type === 'import') {
      const merged = mergeItems(before, command.items);
      after = merged.items;
      counts = { added: merged.added, updated: merged.updated, deleted: merged.deleted };
    } else {
      const result = apply(command, before);
      if (!result.ok) return result;
      after = result.items;
    }

    const changes = diff(before, after);
    if (changes.length === 0) return { ok: true, entryId: null, counts };
    const entry: UndoEntry = { id: nextEntryId++, command, changes };
    save(after, { undoStack: [...state.undoStack, entry].slice(-undoLimit) });
    return { ok: true, entryId: entry.id, counts };
  }

  function boot(): void {
    const result = repo.load();
    switch (result.kind) {
      case 'empty':
        break;

      case 'ok': {
        // Anything about to be overwritten that is not already safe elsewhere
        // is stashed first. Legacy data is safe: LEGACY_KEY is never written.
        const needsCopy = result.source === DATA_KEY && (result.invalid > 0 || result.from < SCHEMA_VERSION);
        let problem: Problem | null = null;
        if (needsCopy) {
          const prefix = result.invalid > 0 ? 'gtd:quarantine:' : `gtd:pre-migration:v${result.from}:`;
          const key = repo.stash(prefix, result.raw);
          if (!key) {
            set({
              items: result.items,
              problem: { kind: 'paused', cause: result.invalid > 0 ? 'unreadable-items' : 'migration', raw: result.raw },
            });
            break;
          }
          if (result.invalid > 0) problem = { kind: 'unreadable-items', count: result.invalid, copyKey: key };
        }
        const purged = purgeTombstones(result.items, now());
        set({ items: purged, problem });
        if (purged.length !== result.items.length || result.from < SCHEMA_VERSION || result.invalid > 0) save(purged);
        break;
      }

      case 'corrupt': {
        if (result.source === LEGACY_KEY) {
          set({ problem: { kind: 'corrupt', copyKey: null, leftInLegacy: true, raw: result.raw } });
          break;
        }
        const key = repo.stash('gtd:quarantine:', result.raw);
        set({
          problem: key
            ? { kind: 'corrupt', copyKey: key, leftInLegacy: false, raw: result.raw }
            : { kind: 'paused', cause: 'corrupt', raw: result.raw },
        });
        break;
      }

      case 'newer':
        set({ problem: { kind: 'newer', version: result.version } });
        break;

      case 'unavailable':
        set({ problem: { kind: 'unavailable' } });
        break;
    }

    repo.subscribe(() => void enqueue(refresh));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (command) => enqueue(() => run(command)),
    boot,
    dismissProblem() {
      if (state.problem && !BLOCKING.has(state.problem.kind) && state.problem.kind !== 'save-failed') set({ problem: null });
    },
    resumeSaving() {
      if (state.problem?.kind !== 'paused') return;
      set({ problem: null });
      save(state.items);
    },
  };
}
```

#### `src/store/undo.ts`

```ts
import type { Item } from '../domain/model.ts';

/**
 * Generic undo, derived from state instead of written per command.
 *
 * Domain operations return new objects only for the items they change, so
 * comparing references between the list before and after a command yields
 * exactly what that command did. Undo puts the "before" versions back. No
 * command needs its own inverse, and a command added later is undoable for
 * free.
 */
export interface Change {
  before: Item | undefined; // undefined: the command created this item
  after: Item;
}

export function diff(before: Item[], after: Item[]): Change[] {
  const previous = new Map(before.map((item) => [item.id, item]));
  const changes: Change[] = [];
  for (const item of after) {
    const old = previous.get(item.id);
    if (old !== item) changes.push({ before: old, after: item });
  }
  return changes;
}

export type RevertResult =
  | { ok: true; items: Item[]; restored: Restored[] }
  | { ok: false; reason: 'undo-conflict' };

/** An item put back by an undo: what it looked like just before, and what it is now. */
export interface Restored {
  replacedUpdatedAt: number | undefined; // updatedAt of `before`, if there was one
  item: Item;
}

/**
 * Reverts `changes` in `items`. Refuses (all or nothing) when any affected
 * item was changed again since, e.g. in another tab: undoing then would
 * silently throw away that later change.
 *
 * The reverted versions get updatedAt = now. Undo is a new change, not time
 * travel; merge and sync must see it as the newest version.
 */
export function revert(items: Item[], changes: Change[], now: number): RevertResult {
  const current = new Map(items.map((item) => [item.id, item]));
  for (const { after } of changes) {
    if (current.get(after.id)?.updatedAt !== after.updatedAt) return { ok: false, reason: 'undo-conflict' };
  }
  const restored: Restored[] = [];
  for (const { before, after } of changes) {
    // Undoing a creation leaves a tombstone, like any other delete.
    const item = before ? { ...before, updatedAt: now } : { ...after, deletedAt: now, updatedAt: now };
    current.set(after.id, item);
    restored.push({ replacedUpdatedAt: before?.updatedAt, item });
  }
  return { ok: true, items: items.map((item) => current.get(item.id)!), restored };
}

/**
 * After an undo, older entries still expect the item as it was before that
 * undo bumped its updatedAt. Point them at the restored version, which is the
 * same content, so undoing twice in a row works instead of reporting a
 * conflict with itself.
 */
export function rebase<E extends { changes: Change[] }>(entries: readonly E[], restored: Restored[]): E[] {
  const byId = new Map(restored.map((r) => [r.item.id, r]));
  return entries.map((entry) => {
    let touched = false;
    const changes = entry.changes.map((change) => {
      const r = byId.get(change.after.id);
      if (r && r.replacedUpdatedAt === change.after.updatedAt) {
        touched = true;
        return { ...change, after: r.item };
      }
      return change;
    });
    return touched ? { ...entry, changes } : entry;
  });
}
```

#### `src/store/test-helpers.ts`

```ts
import { createLocalStorageRepository, type KeyValueStore } from '../persistence/repository.ts';
import { createStore, type StoreOptions } from './store.ts';

/** In-memory Web Storage stand-in. Several stores sharing one = several tabs. */
export class MemoryStore implements KeyValueStore {
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

/** A booted store over `storage`, with a deterministic clock and ids. */
export function openTab(storage: MemoryStore, options: Partial<StoreOptions> = {}) {
  let t = 1_000_000;
  let n = 0;
  const store = createStore({
    repository: createLocalStorageRepository(() => storage, null),
    now: () => ++t,
    newId: () => `id-${++n}-${Math.random().toString(36).slice(2, 6)}`,
    ...options,
  });
  store.boot();
  return store;
}
```

#### `src/store/store.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_KEY, LEGACY_KEY } from '../persistence/repository.ts';
import { itemsInStatus, liveItems } from '../domain/queries.ts';
import { MemoryStore, openTab } from './test-helpers.ts';

const stored = (s: MemoryStore) => JSON.parse(s.getItem(DATA_KEY) ?? 'null');
const titles = (items: readonly { title: string }[]) => items.map((i) => i.title);

test('capture, move and undo round trip through storage', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  const r = await store.dispatch({ type: 'capture', input: 'Buy milk @errands' });
  assert.ok(r.ok && r.entryId !== null);
  const [item] = store.getState().items;
  assert.equal(item.context, 'errands');
  assert.equal(stored(storage).items.length, 1);

  await store.dispatch({ type: 'move', id: item.id, to: 'next' });
  assert.equal(itemsInStatus([...store.getState().items], 'next').length, 1);

  assert.ok((await store.dispatch({ type: 'undo' })).ok);
  assert.equal(store.getState().items[0].status, 'inbox');
  assert.ok((await store.dispatch({ type: 'undo' })).ok, 'undoing twice in a row works');
  assert.deepEqual(liveItems([...store.getState().items]), [], 'undoing the capture leaves a tombstone');
  assert.deepEqual(await store.dispatch({ type: 'undo' }), { ok: false, reason: 'nothing-to-undo' });
});

test('commands run one at a time, in dispatch order', async () => {
  const store = openTab(new MemoryStore());
  const results = await Promise.all(['one', 'two', 'three'].map((input) => store.dispatch({ type: 'capture', input })));
  assert.ok(results.every((r) => r.ok));
  assert.deepEqual(titles(store.getState().items), ['one', 'two', 'three']);
});

test('a command sees what another tab saved, and fails cleanly on stale targets', async () => {
  const storage = new MemoryStore();
  const tabA = openTab(storage);
  const tabB = openTab(storage);
  await tabA.dispatch({ type: 'capture', input: 'shared' });
  const id = tabA.getState().items[0].id;

  await tabB.dispatch({ type: 'capture', input: 'from B' });
  assert.deepEqual(titles(tabB.getState().items), ['shared', 'from B'], 'B re-read before writing');

  await tabB.dispatch({ type: 'remove', id });
  assert.deepEqual(await tabA.dispatch({ type: 'move', id, to: 'next' }), { ok: false, reason: 'deleted' });
});

test('undo refuses to overwrite a change made in another tab', async () => {
  const storage = new MemoryStore();
  const tabA = openTab(storage);
  const tabB = openTab(storage);
  await tabA.dispatch({ type: 'capture', input: 'x' });
  const id = tabA.getState().items[0].id;
  await tabA.dispatch({ type: 'move', id, to: 'next' });
  await tabB.dispatch({ type: 'move', id, to: 'done' });
  assert.deepEqual(await tabA.dispatch({ type: 'undo' }), { ok: false, reason: 'undo-conflict' });
  assert.equal(tabA.getState().items[0].status, 'done');
});

test('undo by entry id reverts that change only (the toast Undo)', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'a' });
  await store.dispatch({ type: 'capture', input: 'b' });
  const [a] = store.getState().items;
  const removed = await store.dispatch({ type: 'remove', id: a.id });
  await store.dispatch({ type: 'capture', input: 'c' });
  assert.ok(removed.ok && removed.entryId !== null);
  await store.dispatch({ type: 'undo', entryId: removed.ok ? removed.entryId! : -1 });
  assert.deepEqual(titles(liveItems([...store.getState().items])), ['a', 'b', 'c']);
});

test('undo history is bounded', async () => {
  const store = openTab(new MemoryStore(), { undoLimit: 2 });
  for (const input of ['1', '2', '3']) await store.dispatch({ type: 'capture', input });
  assert.equal(store.getState().undoStack.length, 2);
});

test('a failed save keeps memory ahead of storage until saving works again', async () => {
  const storage = new MemoryStore();
  const store = openTab(storage);
  await store.dispatch({ type: 'capture', input: 'saved' });
  storage.failWrites = true;
  await store.dispatch({ type: 'capture', input: 'only in memory' });
  assert.equal(store.getState().problem?.kind, 'save-failed');
  assert.equal(store.getState().unsaved, true);

  await store.dispatch({ type: 'capture', input: 'still only in memory' });
  assert.equal(store.getState().items.length, 3, 'the re-read did not throw memory away');

  storage.failWrites = false;
  await store.dispatch({ type: 'capture', input: 'recovered' });
  assert.equal(store.getState().problem, null);
  assert.equal(store.getState().unsaved, false);
  assert.equal(stored(storage).items.length, 4);
});

test('boot: corrupt data is quarantined and the app carries on', async () => {
  const storage = new MemoryStore();
  storage.data.set(DATA_KEY, '{oops');
  const store = openTab(storage);
  const problem = store.getState().problem;
  assert.ok(problem?.kind === 'corrupt' && problem.copyKey?.startsWith('gtd:quarantine:'));
  assert.equal(storage.getItem(problem.kind === 'corrupt' ? problem.copyKey! : ''), '{oops');
  await store.dispatch({ type: 'capture', input: 'after' });
  assert.equal(stored(storage).items.length, 1);
});

test('boot: when no safety copy fits, saving pauses until the user resumes', async () => {
  const storage = new MemoryStore();
  storage.data.set(DATA_KEY, '{oops');
  storage.failWrites = true;
  const store = openTab(storage);
  assert.equal(store.getState().problem?.kind, 'paused');

  storage.failWrites = false;
  await store.dispatch({ type: 'capture', input: 'while paused' });
  assert.equal(storage.getItem(DATA_KEY), '{oops', 'the only copy is untouched');
  assert.equal(store.getState().unsaved, true);

  store.resumeSaving();
  assert.equal(store.getState().problem, null);
  assert.deepEqual(titles(stored(storage).items), ['while paused']);
});

test('boot: data from a newer schema makes the tab read-only', async () => {
  const storage = new MemoryStore();
  const newer = JSON.stringify({ schemaVersion: 99, items: [] });
  storage.data.set(DATA_KEY, newer);
  const store = openTab(storage);
  assert.deepEqual(store.getState().problem, { kind: 'newer', version: 99 });
  await store.dispatch({ type: 'capture', input: 'x' });
  assert.equal(storage.getItem(DATA_KEY), newer);
  store.dismissProblem();
  assert.equal(store.getState().problem?.kind, 'newer', 'blocking problems cannot be dismissed');
});

test('boot: step-1 data is migrated and saved without a problem', () => {
  const storage = new MemoryStore();
  const v1 = JSON.stringify([{ id: 'a', title: 'Old', status: 'done', createdAt: 1, updatedAt: 3 }]);
  storage.data.set(LEGACY_KEY, v1);
  const store = openTab(storage);
  assert.equal(store.getState().problem, null);
  assert.equal(stored(storage).schemaVersion, 2);
  assert.equal(storage.getItem(LEGACY_KEY), v1);
});

test('boot: unavailable storage is reported', () => {
  const store = openTab(new MemoryStore(), {
    repository: {
      load: () => ({ kind: 'unavailable', error: new Error('blocked') }),
      save: () => ({ ok: false, error: new Error('blocked') }),
      stash: () => null,
      subscribe: () => () => {},
    },
  });
  assert.deepEqual(store.getState().problem, { kind: 'unavailable' });
});

test('import merges, reports counts, and is undoable as one step', async () => {
  const store = openTab(new MemoryStore());
  await store.dispatch({ type: 'capture', input: 'mine' });
  const incoming = [{ id: 'x', title: 'imported', status: 'next' as const, createdAt: 1, updatedAt: 1 }];
  const r = await store.dispatch({ type: 'import', items: incoming });
  assert.deepEqual(r.ok && r.counts, { added: 1, updated: 0, deleted: 0 });
  await store.dispatch({ type: 'undo' });
  assert.deepEqual(titles(liveItems([...store.getState().items])), ['mine']);
  const again = await store.dispatch({ type: 'import', items: [] });
  assert.deepEqual(again, { ok: true, entryId: null, counts: { added: 0, updated: 0, deleted: 0 } });
});

test('subscribers hear every state change and can unsubscribe', async () => {
  const store = openTab(new MemoryStore());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  await store.dispatch({ type: 'capture', input: 'x' });
  assert.ok(calls > 0);
  off();
  const before = calls;
  await store.dispatch({ type: 'capture', input: 'y' });
  assert.equal(calls, before);
});
```

#### `src/store/undo.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, rebase, revert } from './undo.ts';
import { makeItem } from '../domain/test-helpers.ts';

const a = makeItem({ id: 'a', updatedAt: 10 });
const b = makeItem({ id: 'b', updatedAt: 10 });

test('diff finds exactly the items whose object changed', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const c = makeItem({ id: 'c', updatedAt: 20 });
  assert.deepEqual(diff([a, b], [a2, b, c]), [
    { before: a, after: a2 },
    { before: undefined, after: c },
  ]);
  assert.deepEqual(diff([a, b], [a, b]), []);
});

test('revert restores previous versions and tombstones created items, as new changes', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const c = makeItem({ id: 'c', updatedAt: 20 });
  const r = revert([a2, b, c], diff([a, b], [a2, b, c]), 99);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [ra, rb, rc] = r.items;
  assert.equal(ra.status, 'inbox');
  assert.equal(ra.updatedAt, 99, 'undo is the newest change');
  assert.equal(rb, b, 'untouched items keep their identity');
  assert.equal(rc.deletedAt, 99);
});

test('revert refuses when an affected item changed since', () => {
  const a2 = { ...a, status: 'next' as const, updatedAt: 20 };
  const changes = diff([a], [a2]);
  const changedElsewhere = { ...a2, status: 'done' as const, completedAt: 30, updatedAt: 30 };
  assert.deepEqual(revert([changedElsewhere], changes, 99), { ok: false, reason: 'undo-conflict' });
});

test('rebase lets an older entry be undone after a newer one', () => {
  const a1 = { ...a, status: 'next' as const, updatedAt: 20 }; // entry 1: inbox -> next
  const a2 = { ...a1, status: 'someday' as const, updatedAt: 30 }; // entry 2: next -> someday
  const e1 = { changes: diff([a], [a1]) };
  const e2 = { changes: diff([a1], [a2]) };
  const undo2 = revert([a2], e2.changes, 40);
  assert.ok(undo2.ok);
  if (!undo2.ok) return;
  const [rebased] = rebase([e1], undo2.restored);
  const undo1 = revert(undo2.items, rebased.changes, 50);
  assert.ok(undo1.ok, 'no false conflict');
  assert.equal(undo1.ok && undo1.items[0].status, 'inbox');
  assert.equal(rebase([e1], []).at(0), e1, 'untouched entries keep their identity');
});
```

### UI wiring

#### `src/ui/main.tsx`

```tsx
// Order matters: the design-system elements must be registered before the
// first render, so Preact finds their properties and sets them as properties
// rather than attributes (guide 3.5).
import './nldd.ts';
import './theme.css';
import { render } from 'preact';
import { App } from './App.tsx';
import { installShortcuts } from './shortcuts.ts';

installShortcuts();
render(<App />, document.getElementById('app')!);
```

#### `src/ui/App.tsx`

```tsx
import { useEffect } from 'preact/hooks';
import { copy } from './copy.ts';
import { goHome, route } from './router.ts';
import { HOME } from './routes.ts';
import { ListPage } from './components/ListPage.tsx';
import { Sidebar } from './components/Sidebar.tsx';

/**
 * App shell: NLDD's navigation split view. The sidebar (the lists) is the
 * primary pane; the main pane shows the current list. Below the md
 * breakpoint the split view turns the sidebar into a sheet by itself, which
 * is the phone layout for free.
 */
export function App() {
  const current = route.value;
  useEffect(() => {
    if (!current) goHome();
  }, [current]);
  const status = (current ?? HOME).status;

  return (
    <nldd-app-view>
      <nldd-navigation-split-view primary-sidebar-accessible-label={copy.navLabel}>
        <nldd-split-view-pane slot="primary-sidebar" has-content>
          <Sidebar current={status} />
        </nldd-split-view-pane>
        <nldd-split-view-pane slot="main" has-content>
          <ListPage status={status} />
        </nldd-split-view-pane>
      </nldd-navigation-split-view>
    </nldd-app-view>
  );
}
```

#### `src/ui/app-state.ts`

```ts
import { computed, signal } from '@preact/signals';
import { STATUSES, type Status } from '../domain/model.ts';
import { itemsInStatus } from '../domain/queries.ts';
import { createLocalStorageRepository } from '../persistence/repository.ts';
import { createStore } from '../store/store.ts';

/**
 * Wiring: the one store instance, booted before the first render, and a
 * signal bridge. This file is the ONLY place the UI touches the store's
 * subscribe(); components read signals, and Preact re-renders exactly the
 * components that read a signal that changed.
 */
export const store = createStore({ repository: createLocalStorageRepository() });
store.boot();

export const appState = signal(store.getState());
store.subscribe((state) => {
  appState.value = state;
});

/** Items per list, recomputed only when the item array changes. */
export const lists = computed(() => {
  const items = [...appState.value.items];
  return Object.fromEntries(STATUSES.map((status) => [status, itemsInStatus(items, status)])) as Record<Status, ReturnType<typeof itemsInStatus>>;
});

// Closing the tab with changes that exist only in memory asks first.
window.addEventListener('beforeunload', (event) => {
  if (appState.value.unsaved) event.preventDefault();
});
```

#### `src/ui/commands.ts`

```ts
import type { Item } from '../domain/model.ts';
import { parseBackup, serializeBackup, backupFilename } from '../persistence/backup.ts';
import type { Command, DispatchResult } from '../store/store.ts';
import { appState, store } from './app-state.ts';
import { copy } from './copy.ts';
import { downloadText } from './download.ts';
import { writeLastExport } from './last-export.ts';
import { notify } from './notify.ts';

/**
 * What the UI's buttons and shortcuts call. Each dispatches a store command
 * and turns a failure into a notification. Components never touch the store
 * directly, so "what happens on click" is readable in one file.
 */
export async function run(command: Command): Promise<DispatchResult> {
  const result = await store.dispatch(command);
  if (!result.ok) notify(copy.failure[result.reason], { variant: 'warning' });
  return result;
}

export async function deleteItem(item: Item): Promise<void> {
  const result = await run({ type: 'remove', id: item.id });
  if (result.ok && result.entryId !== null) {
    const entryId = result.entryId;
    notify(copy.deleted(item.title), { action: { label: copy.undo, run: () => void run({ type: 'undo', entryId }) } });
  }
}

export async function undoLast(): Promise<void> {
  const result = await run({ type: 'undo' });
  if (result.ok) notify(copy.undone);
}

export function exportData(): void {
  downloadText(backupFilename(), serializeBackup([...appState.value.items]));
  writeLastExport(Date.now());
}

/**
 * No confirmation dialog: import is one undoable step, and the notification
 * offers Undo. NLDD's guideline, "undo over confirm", fits exactly.
 */
export async function importFile(file: File): Promise<void> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    notify(copy.backup.importFailed(parsed.error), { variant: 'critical' });
    return;
  }
  const result = await run({ type: 'import', items: parsed.items });
  if (!result.ok || !result.counts) return;
  const entryId = result.entryId;
  notify(copy.backup.imported(result.counts), {
    variant: 'success',
    action: entryId === null ? undefined : { label: copy.undo, run: () => void run({ type: 'undo', entryId }) },
  });
}

export const dismissProblem = () => store.dismissProblem();
export const resumeSaving = () => store.resumeSaving();

let persistenceRequested = false;

/** Ask the browser not to evict our storage under disk pressure. Once per session, best effort. */
export async function requestPersistence(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Unsupported or refused: export remains the real safeguard.
  }
}
```

#### `src/ui/router.ts`

```ts
import { computed, signal } from '@preact/signals';
import { HOME, parseRoute, pathFor, type Route } from './routes.ts';

/**
 * A 20-line router on the History API. Why not a routing library: the app
 * has one route shape, and NLDD list rows are buttons in a shadow root, so a
 * router that intercepts <a> clicks would not see them anyway.
 * nginx and the Vite dev server serve index.html for every path (SPA fallback).
 */
const path = signal(window.location.pathname);

window.addEventListener('popstate', () => {
  path.value = window.location.pathname;
});

export const route = computed<Route | null>(() => parseRoute(path.value));

export function navigate(to: Route, { replace = false } = {}): void {
  const target = pathFor(to);
  if (target === path.value) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  path.value = target;
}

export function goHome(): void {
  navigate(HOME, { replace: true });
}
```

#### `src/ui/routes.ts`

```ts
import { STATUSES, type Status } from '../domain/model.ts';

/**
 * The URL scheme, as pure functions (tested without a browser).
 * One view per list for now; projects and the review get their own routes later.
 */
export type Route = { view: 'list'; status: Status };

export const HOME: Route = { view: 'list', status: 'inbox' };

export function pathFor(route: Route): string {
  return `/${route.status}`;
}

/** null means "no such page": the app redirects home. */
export function parseRoute(pathname: string): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return HOME;
  if (segments.length === 1 && (STATUSES as readonly string[]).includes(segments[0])) {
    return { view: 'list', status: segments[0] as Status };
  }
  return null;
}
```

#### `src/ui/keys.ts`

```ts
import { STATUSES, type Status } from '../domain/model.ts';

/**
 * Keyboard shortcuts as a pure function from a key press to an action, so
 * the rules are tested without a browser. `shortcuts.ts` wires it to window.
 *
 *   c           focus the capture field
 *   1 … 5       go to Inbox, Next, Waiting, Someday, Done
 *   Ctrl/⌘ + Z  undo the last change
 *
 * Single keys never fire while typing. Undo doesn't either: inside a text
 * field, Ctrl+Z belongs to the field's own text undo.
 */
export type ShortcutAction = { type: 'focus-capture' } | { type: 'go'; status: Status } | { type: 'undo' };

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export const LIST_KEYS: Record<Status, string> = Object.fromEntries(
  STATUSES.map((status, i) => [status, String(i + 1)]),
) as Record<Status, string>;

export function matchShortcut(e: KeyPress, typing: boolean): ShortcutAction | null {
  if (typing || e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') return { type: 'undo' };
  if (mod || e.shiftKey) return null;
  if (e.key === 'c') return { type: 'focus-capture' };
  const status = STATUSES.find((s) => LIST_KEYS[s] === e.key);
  return status ? { type: 'go', status } : null;
}

/** Whether the element that really has focus (looked up through shadow roots) takes text. */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el?.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
```

#### `src/ui/shortcuts.ts`

```ts
import { isTypingTarget, matchShortcut } from './keys.ts';
import { navigate } from './router.ts';
import { undoLast } from './commands.ts';

/** The capture field registers itself here so `c` can focus it. */
let focusCapture: (() => void) | null = null;
export function registerCaptureFocus(fn: (() => void) | null): void {
  focusCapture = fn;
}

export function installShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    // Focus inside an NLDD field sits in its shadow root; composedPath()[0]
    // is the real <input>, where event.target would be the host element.
    const typing = isTypingTarget(event.composedPath()[0] as Element | undefined);
    const action = matchShortcut(event, typing);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'focus-capture') focusCapture?.();
    else if (action.type === 'go') navigate({ view: 'list', status: action.status });
    else void undoLast();
  });
}
```

#### `src/ui/notify.ts`

```ts
/**
 * Transient messages through nldd-notification, created imperatively.
 *
 * Why not render them from Preact: a notification moves itself into a shared
 * region at the top of the page. An element that relocates itself out of the
 * parent Preact put it in breaks Preact's bookkeeping of that parent's
 * children. Owning these elements outside the component tree avoids the
 * problem entirely, and "fire a message from anywhere" is what a toast is.
 */
export interface NotifyOptions {
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'critical';
  action?: { label: string; run: () => void };
}

export function notify(text: string, { variant = 'neutral', action }: NotifyOptions = {}): void {
  const el = document.createElement('nldd-notification');
  el.setAttribute('text', text);
  el.setAttribute('variant', variant);
  if (action) {
    const button = document.createElement('nldd-button');
    button.setAttribute('slot', 'actions');
    button.setAttribute('text', action.label);
    button.addEventListener('click', () => {
      el.remove();
      action.run();
    });
    el.appendChild(button);
  }
  el.addEventListener('dismiss', () => el.remove());
  document.body.appendChild(el);
}
```

#### `src/ui/copy.ts`

```ts
import type { Status } from '../domain/model.ts';
import type { CommandFailure, Problem } from '../store/store.ts';

/**
 * Every string the app shows, in one place. The store and domain return
 * data (a failure reason, a Problem); only this file turns them into words.
 * That keeps wording consistent and makes a switch to Dutch one file's work.
 * NLDD's own built-in strings (e.g. "Navigatie") are Dutch by default and
 * are overridden per component through its `translations` property.
 */
export const copy = {
  appName: 'Personal GTD',
  skipToList: 'Skip to list',
  navLabel: 'Lists',

  lists: {
    inbox: 'Inbox',
    next: 'Next actions',
    waiting: 'Waiting for',
    someday: 'Someday / maybe',
    done: 'Done',
  } satisfies Record<Status, string>,

  empty: {
    inbox: 'Inbox zero. Capture anything that has your attention.',
    next: 'No next actions. Clarify your inbox to add some.',
    waiting: 'Not waiting on anyone.',
    someday: 'Nothing parked for later.',
    done: 'Nothing completed yet.',
  } satisfies Record<Status, string>,

  moveLabel(from: Status, to: Status): string {
    if (from === 'done') return 'Reopen';
    if (to === 'done') return 'Done';
    return { inbox: 'To inbox', next: 'Next', waiting: 'Waiting', someday: 'Someday', done: 'Done' }[to];
  },

  capture: {
    label: 'Capture',
    placeholder: 'Capture a thought… (try "Buy milk @errands")',
    submit: 'Add',
    addedElsewhere: 'Added to Inbox.',
  },

  deleteLabel: (title: string) => `Delete "${title}"`,
  deleted: (title: string) => `Deleted "${title}".`,
  undo: 'Undo',
  undone: 'Undone.',

  failure: {
    'empty-input': 'Nothing to capture.',
    'not-found': 'That item no longer exists. It may have been changed in another tab.',
    'not-allowed': 'That item was moved in another tab. The list has been refreshed.',
    deleted: 'That item was deleted in another tab.',
    'not-deleted': 'That item was already restored.',
    'nothing-to-undo': 'Nothing to undo.',
    'undo-conflict': "Can't undo: that item was changed again since, probably in another tab.",
  } satisfies Record<CommandFailure, string>,

  backup: {
    export: 'Export',
    import: 'Import…',
    never: 'Never exported.',
    last: (days: number) => (days === 0 ? 'Last export: today.' : `Last export: ${days} day${days === 1 ? '' : 's'} ago.`),
    imported: (c: { added: number; updated: number; deleted: number }) =>
      `Imported: ${c.added} new, ${c.updated} updated, ${c.deleted} deleted.`,
    importFailed: (reason: string) => `Import failed: ${reason}`,
  },

  problem(p: Problem): { text: string; supporting?: string } {
    switch (p.kind) {
      case 'unreadable-items':
        return { text: `${p.count} saved item(s) could not be read and were left out.`, supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'corrupt':
        return p.leftInLegacy
          ? { text: 'Your saved data could not be read.', supporting: 'It was left untouched in this browser (gtd:items).' }
          : { text: 'Your saved data could not be read.', supporting: `A copy was kept in this browser under "${p.copyKey}".` };
      case 'paused':
        return { text: 'Your saved data could not be read, and no safety copy fits in storage.', supporting: 'Saving is paused so it is not overwritten. Download it first, then resume.' };
      case 'newer':
        return { text: `Your data was saved by a newer version of this app (schema ${p.version}).`, supporting: "This version can't read it, so nothing is saved here. Reload once the newer version is deployed." };
      case 'unavailable':
        return { text: 'Browser storage is unavailable, so nothing will be saved.', supporting: 'Use Export before closing this tab.' };
      case 'save-failed':
        return { text: 'Your last change could not be saved.', supporting: 'Browser storage may be full or blocked. Export your data now so nothing is lost.' };
    }
  },
  problemActions: { download: 'Download data', resume: 'Resume saving', export: 'Export' },


} as const;
```

#### `src/ui/last-export.ts`

```ts
const KEY = 'gtd:lastExportAt';

/** When the user last exported. A UI nicety, so failures are ignored. */
export function readLastExport(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastExport(timestamp: number): void {
  try {
    localStorage.setItem(KEY, String(timestamp));
  } catch {
    // Not critical: the export itself succeeded.
  }
}
```

### NLDD

#### `src/ui/nldd.ts`

```ts
// Design-system components this app renders, one entry point each, plus the
// stylesheet WITHOUT the Rijksoverheid font (see the step 3 guide, 3.4).
// Importing the package root would register all ~110 components.
// nldd-imports.test.ts fails when a <nldd-*> tag in src/ui is not covered here,
// or when an import here is no longer used.
import '@nldd/design-system/styles/system-font';
import '@nldd/design-system/app-view';
import '@nldd/design-system/badge';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/keyboard-shortcut';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/navigation-split-view';
import '@nldd/design-system/notification';
import '@nldd/design-system/page';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/skip-link';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/split-view-pane';
import '@nldd/design-system/tag';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/top-title-bar';
```

#### `src/ui/nldd-jsx.d.ts`

```ts
/**
 * Lets Preact's JSX type-check <nldd-*> elements.
 *
 * NLDD ships types for Vue only. Its components do declare themselves in
 * HTMLElementTagNameMap, so every tag and its element class are known; this
 * file maps them into Preact's IntrinsicElements. For each tag you get:
 *   - the element's own properties (camelCase), typed from its class,
 *     which win over same-named generic HTML attributes (e.g. `size`);
 *   - any kebab-case attribute, as written in the NLDD docs (`supporting-text`);
 *   - lowercase custom-event handlers (`ondismiss`, `onback`); see guide 3.5
 *     for why the lowercase matters.
 * Kebab attributes are not checked by name. That is the trade-off for not
 * hand-maintaining 110 component signatures.
 */
import type { JSX } from 'preact';

type NlddTag = Extract<keyof HTMLElementTagNameMap, `nldd-${string}`>;
type OwnProps<E> = Partial<Omit<E, keyof HTMLElement>>;
type KebabAttributes = { [attribute: `${string}-${string}`]: string | number | boolean | undefined };
type EventHandlers = { [handler: `on${string}`]: ((event: CustomEvent) => void) | undefined };

type NlddProps<E extends HTMLElement> = Omit<JSX.HTMLAttributes<E>, keyof OwnProps<E>> &
  OwnProps<E> &
  KebabAttributes &
  EventHandlers;

type NlddElements = { [K in NlddTag]: NlddProps<HTMLElementTagNameMap[K]> };

// The augmentation form Preact documents for custom elements.
declare global {
  namespace preact.JSX {
    interface IntrinsicElements extends NlddElements {}
  }
}

export {};
```

#### `src/ui/theme.css`

```css
/*
 * App styling on top of NLDD. Everything else comes from the components.
 *
 * 1. Accent colour. NLDD's accent points at lintblauw, the Rijksoverheid
 *    colour. This is a personal tool, not a government service, so it points
 *    at another palette from the same system. One palette name to change;
 *    every accent-coloured component follows. Remove this block to go back.
 */
:root {
  --primitives-color-accent-0: var(--primitives-color-violet-0);
  --primitives-color-accent-25: var(--primitives-color-violet-25);
  --primitives-color-accent-50: var(--primitives-color-violet-50);
  --primitives-color-accent-75: var(--primitives-color-violet-75);
  --primitives-color-accent-100: var(--primitives-color-violet-100);
  --primitives-color-accent-150: var(--primitives-color-violet-150);
  --primitives-color-accent-200: var(--primitives-color-violet-200);
  --primitives-color-accent-250: var(--primitives-color-violet-250);
  --primitives-color-accent-300: var(--primitives-color-violet-300);
  --primitives-color-accent-350: var(--primitives-color-violet-350);
  --primitives-color-accent-400: var(--primitives-color-violet-400);
  --primitives-color-accent-450: var(--primitives-color-violet-450);
  --primitives-color-accent-500: var(--primitives-color-violet-500);
  --primitives-color-accent-550: var(--primitives-color-violet-550);
  --primitives-color-accent-600: var(--primitives-color-violet-600);
  --primitives-color-accent-650: var(--primitives-color-violet-650);
  --primitives-color-accent-700: var(--primitives-color-violet-700);
  --primitives-color-accent-750: var(--primitives-color-violet-750);
  --primitives-color-accent-800: var(--primitives-color-violet-800);
  --primitives-color-accent-850: var(--primitives-color-violet-850);
  --primitives-color-accent-900: var(--primitives-color-violet-900);
  --primitives-color-accent-925: var(--primitives-color-violet-925);
  --primitives-color-accent-950: var(--primitives-color-violet-950);
  --primitives-color-accent-975: var(--primitives-color-violet-975);
  --primitives-color-accent-1000: var(--primitives-color-violet-1000);
}

/* 2. The few layouts that are not a component. Primitives only, no raw values. */
.capture {
  display: flex;
  gap: var(--primitives-space-8);
  align-items: start;
}

.capture nldd-text-field {
  flex: 1;
}

.backup-info {
  margin-block: var(--primitives-space-8) 0;
  font-size: 0.875em;
  color: var(--primitives-color-coolgray-600);
}
```

### Components

#### `src/ui/components/Sidebar.tsx`

```tsx
import { STATUSES, type Status } from '../../domain/model.ts';
import { lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { LIST_KEYS } from '../keys.ts';
import { navigate } from '../router.ts';
import { BackupPanel } from './BackupPanel.tsx';

const ICONS: Record<Status, string> = {
  inbox: 'inbox',
  next: 'arrow-right',
  waiting: 'clock',
  someday: 'lightbulb',
  done: 'check-mark-circle',
};

export function Sidebar({ current }: { current: Status }) {
  const byStatus = lists.value;
  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.appName} />
      <nldd-simple-section>
        {/* The skip link wraps the navigation; activating it jumps past it. */}
        <nldd-skip-link text={copy.skipToList}>
          <nldd-list type="navigation" accessible-label={copy.navLabel}>
            {STATUSES.map((status) => {
              const count = byStatus[status].length;
              return (
                <nldd-list-item
                  key={status}
                  button
                  selected={status === current || undefined}
                  onClick={() => navigate({ view: 'list', status })}
                >
                  <nldd-icon-cell size="20" icon={ICONS[status]} />
                  <nldd-spacer-cell size="8" />
                  <nldd-text-cell text={copy.lists[status]} />
                  {status !== 'done' && count > 0 && (
                    <nldd-cell>
                      <nldd-badge size="sm" color={status === 'inbox' ? 'accent' : 'neutral'} number={count} />
                    </nldd-cell>
                  )}
                  <nldd-spacer-cell size="8" />
                  <nldd-cell>
                    <nldd-keyboard-shortcut size="sm" variant="simple" keys={LIST_KEYS[status]} />
                  </nldd-cell>
                </nldd-list-item>
              );
            })}
          </nldd-list>
        </nldd-skip-link>
        <nldd-spacer size="24" />
        <BackupPanel />
      </nldd-simple-section>
    </nldd-page>
  );
}
```

#### `src/ui/components/ListPage.tsx`

```tsx
import type { Status } from '../../domain/model.ts';
import { appState, lists } from '../app-state.ts';
import { copy } from '../copy.ts';
import { CaptureForm } from './CaptureForm.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ProblemBanner } from './ProblemBanner.tsx';

export function ListPage({ status }: { status: Status }) {
  const items = lists.value[status];
  const { problem } = appState.value;
  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.lists[status]} />
      <nldd-simple-section>
        {problem && <ProblemBanner problem={problem} />}
        <CaptureForm announceInbox={status !== 'inbox'} />
        <nldd-spacer size="16" />
        <nldd-list accessible-label={copy.lists[status]}>
          {items.length === 0 ? (
            <nldd-list-item>
              <nldd-text-cell text={copy.empty[status]} />
            </nldd-list-item>
          ) : (
            items.map((item) => <ItemRow key={item.id} item={item} />)
          )}
        </nldd-list>
      </nldd-simple-section>
    </nldd-page>
  );
}
```

#### `src/ui/components/ItemRow.tsx`

```tsx
import type { Item } from '../../domain/model.ts';
import { TRANSITIONS } from '../../domain/transitions.ts';
import { deleteItem, run } from '../commands.ts';
import { copy } from '../copy.ts';

/**
 * One item. The row itself is not an action; its buttons are. nldd-list
 * gives the keyboard for free: arrow keys move between rows, Tab walks the
 * buttons of the current row.
 */
export function ItemRow({ item }: { item: Item }) {
  return (
    <nldd-list-item>
      <nldd-text-cell text={item.title} />
      {item.context && (
        <nldd-cell>
          <nldd-tag size="sm" text={`@${item.context}`} />
        </nldd-cell>
      )}
      <nldd-spacer-cell size="8" />
      <nldd-cell>
        <nldd-button-group size="sm">
          {TRANSITIONS[item.status].map((to) => {
            const label = copy.moveLabel(item.status, to);
            return (
              <nldd-button
                key={to}
                size="sm"
                variant="neutral-tinted"
                text={label}
                accessible-label={`${label}: ${item.title}`}
                onClick={() => void run({ type: 'move', id: item.id, to })}
              />
            );
          })}
        </nldd-button-group>
      </nldd-cell>
      <nldd-cell>
        <nldd-icon-button
          size="sm"
          variant="neutral-transparent"
          icon="trash"
          text={copy.deleteLabel(item.title)}
          onClick={() => void deleteItem(item)}
        />
      </nldd-cell>
    </nldd-list-item>
  );
}
```

#### `src/ui/components/CaptureForm.tsx`

```tsx
import { useEffect, useRef } from 'preact/hooks';
import { requestPersistence, run } from '../commands.ts';
import { copy } from '../copy.ts';
import { notify } from '../notify.ts';
import { registerCaptureFocus } from '../shortcuts.ts';

/**
 * Quick capture. A plain <form>: nldd-text-field and nldd-button are
 * form-associated (NLDD ≥ 0.8.81), so Enter in the field and a click on the
 * button both submit it. The field is uncontrolled: we read `.value` on
 * submit, which avoids re-rendering on every keystroke.
 */
export function CaptureForm({ announceInbox }: { announceInbox: boolean }) {
  const field = useRef<HTMLElementTagNameMap['nldd-text-field']>(null);

  useEffect(() => {
    registerCaptureFocus(() => field.current?.focus());
    return () => registerCaptureFocus(null);
  }, []);

  async function onSubmit(event: Event) {
    event.preventDefault();
    const el = field.current;
    const value = el?.value.trim();
    if (!el || !value) return;
    const result = await run({ type: 'capture', input: value });
    if (!result.ok) return;
    el.value = '';
    if (announceInbox) notify(copy.capture.addedElsewhere, { variant: 'success' });
    void requestPersistence();
  }

  return (
    <form class="capture" onSubmit={onSubmit}>
      <nldd-text-field
        ref={field}
        name="capture"
        accessible-label={copy.capture.label}
        placeholder={copy.capture.placeholder}
        autocomplete="off"
        enter-key="done"
      />
      <nldd-button type="submit" variant="accent-filled" start-icon="plus" text={copy.capture.submit} />
    </form>
  );
}
```

#### `src/ui/components/ProblemBanner.tsx`

```tsx
import type { Problem } from '../../store/store.ts';
import { dismissProblem, exportData, resumeSaving } from '../commands.ts';
import { copy } from '../copy.ts';
import { downloadText } from '../download.ts';

/** Storage problems from the store, as an NLDD banner with the matching way out. */
export function ProblemBanner({ problem }: { problem: Problem }) {
  const { text, supporting } = copy.problem(problem);
  const informational = problem.kind === 'unreadable-items' || problem.kind === 'corrupt';
  return (
    <>
      <nldd-banner
        variant={informational ? 'warning' : 'critical'}
        text={text}
        supporting-text={supporting}
        dismissible={informational || undefined}
        ondismiss={dismissProblem}
      >
        {'raw' in problem && (
          <nldd-button
            slot="actions"
            size="sm"
            text={copy.problemActions.download}
            onClick={() => downloadText('gtd-unreadable-data.json', problem.raw)}
          />
        )}
        {problem.kind === 'paused' && (
          <nldd-button slot="actions" size="sm" text={copy.problemActions.resume} onClick={resumeSaving} />
        )}
        {(problem.kind === 'save-failed' || problem.kind === 'unavailable') && (
          <nldd-button slot="actions" size="sm" text={copy.problemActions.export} onClick={exportData} />
        )}
      </nldd-banner>
      <nldd-spacer size="16" />
    </>
  );
}
```

#### `src/ui/components/BackupPanel.tsx`

```tsx
import { useRef, useState } from 'preact/hooks';
import { exportData, importFile } from '../commands.ts';
import { copy } from '../copy.ts';
import { readLastExport } from '../last-export.ts';

export function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [lastExport, setLastExport] = useState(readLastExport);
  const days = lastExport === null ? null : Math.floor((Date.now() - lastExport) / 86_400_000);

  return (
    <div class="backup">
      <nldd-button-group size="sm">
        <nldd-button
          size="sm"
          start-icon="export"
          text={copy.backup.export}
          onClick={() => {
            exportData();
            setLastExport(Date.now());
          }}
        />
        <nldd-button size="sm" start-icon="import" text={copy.backup.import} onClick={() => fileInput.current?.click()} />
      </nldd-button-group>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = ''; // allow importing the same file again
          if (file) void importFile(file);
        }}
      />
      <p class="backup-info">{days === null ? copy.backup.never : copy.backup.last(days)}</p>
    </div>
  );
}
```

### UI unit tests

#### `src/ui/routes.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES } from '../domain/model.ts';
import { HOME, parseRoute, pathFor } from './routes.ts';

test('every list has a path that parses back to it', () => {
  for (const status of STATUSES) {
    const route = { view: 'list' as const, status };
    assert.deepEqual(parseRoute(pathFor(route)), route);
  }
});

test('root and trailing slashes go home or to the list; anything else is unknown', () => {
  assert.deepEqual(parseRoute('/'), HOME);
  assert.deepEqual(parseRoute('/next/'), { view: 'list', status: 'next' });
  for (const bad of ['/nope', '/next/extra', '/Inbox']) assert.equal(parseRoute(bad), null, bad);
});
```

#### `src/ui/keys.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTypingTarget, matchShortcut, type KeyPress } from './keys.ts';

const key = (k: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

test('single keys map to actions', () => {
  assert.deepEqual(matchShortcut(key('c'), false), { type: 'focus-capture' });
  assert.deepEqual(matchShortcut(key('1'), false), { type: 'go', status: 'inbox' });
  assert.deepEqual(matchShortcut(key('5'), false), { type: 'go', status: 'done' });
  assert.equal(matchShortcut(key('6'), false), null);
  assert.equal(matchShortcut(key('C', { shiftKey: true }), false), null);
});

test('undo works with Ctrl and with Cmd, but not with Shift (that is redo)', () => {
  assert.deepEqual(matchShortcut(key('z', { ctrlKey: true }), false), { type: 'undo' });
  assert.deepEqual(matchShortcut(key('z', { metaKey: true }), false), { type: 'undo' });
  assert.equal(matchShortcut(key('z', { ctrlKey: true, shiftKey: true }), false), null);
  assert.equal(matchShortcut(key('c', { ctrlKey: true }), false), null, 'Ctrl+C stays copy');
});

test('nothing fires while typing', () => {
  for (const k of [key('c'), key('1'), key('z', { ctrlKey: true })]) assert.equal(matchShortcut(k, true), null);
  assert.ok(isTypingTarget({ tagName: 'INPUT' }));
  assert.ok(isTypingTarget({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!isTypingTarget({ tagName: 'BUTTON' }));
  assert.ok(!isTypingTarget(null));
});
```

#### `src/ui/nldd-imports.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A <nldd-*> tag whose component was never imported renders as an unknown
 * element: no error, just an empty box. This test makes that a red build,
 * like regelrecht's check-nldd-imports script, and also flags imports that
 * are no longer used (they only cost bundle size).
 */
const UI = fileURLToPath(new URL('.', import.meta.url));
const PKG = fileURLToPath(new URL('../../node_modules/@nldd/design-system/package.json', import.meta.url));

function uiSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return uiSources(path);
    return /\.tsx?$/.test(e.name) && !/(\.test\.ts|\.d\.ts|nldd\.ts)$/.test(e.name) ? [path] : [];
  });
}

test('every nldd-* tag used in src/ui is imported in nldd.ts, and nothing more', { skip: !existsSync(PKG) && 'run npm install first' }, () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { exports: Record<string, unknown> };
  const entries = Object.keys(pkg.exports)
    .filter((k) => k.startsWith('./'))
    .map((k) => k.slice(2))
    .filter((k) => !k.startsWith('styles') && !['bundle', 'breakpoints', 'vue'].includes(k) && !k.includes('.'));

  // Sub-components ship with their parent (nldd-menu-item lives in ./menu):
  // a tag maps to the longest entry that is a prefix of it.
  const entryFor = (tag: string) =>
    entries.filter((e) => tag === e || tag.startsWith(`${e}-`)).sort((a, b) => b.length - a.length)[0];

  const used = new Set<string>();
  for (const file of uiSources(UI)) {
    const text = readFileSync(file, 'utf8');
    for (const [, tag] of text.matchAll(/<nldd-([a-z0-9-]+)/g)) used.add(tag);
    for (const [, tag] of text.matchAll(/['"]nldd-([a-z0-9-]+)['"]/g)) used.add(tag); // createElement('nldd-…')
  }
  const unknown = [...used].filter((tag) => !entryFor(tag));
  assert.deepEqual(unknown, [], 'tags that no design-system entry defines (typo?)');

  const needed = new Set([...used].map((tag) => entryFor(tag)!));
  const imported = new Set(
    [...readFileSync(join(UI, 'nldd.ts'), 'utf8').matchAll(/@nldd\/design-system\/([a-z0-9-]+)'/g)].map((m) => m[1]),
  );
  assert.deepEqual([...needed].filter((e) => !imported.has(e)).sort(), [], 'used but not imported in nldd.ts');
  assert.deepEqual([...imported].filter((e) => !needed.has(e)).sort(), [], 'imported in nldd.ts but unused');
});
```

### End-to-end tests

#### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the PRODUCTION build (vite build + preview):
 * that is what nginx serves, and it is where a missing design-system import
 * or a CSS-lowering problem would show up.
 *
 * Every test gets a fresh browser context, so a fresh localStorage.
 * Waits are conditions (expect(...).toBeVisible()), never fixed timeouts.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Desktop first: the full suite.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone in mind: only tests tagged @phone, at phone size with touch.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
```

#### `e2e/helpers.ts`

```ts
import { expect, type Page } from '@playwright/test';

/**
 * Locators go by role and accessible name, the way a user (or a screen
 * reader) finds things. Playwright pierces open shadow roots, so this works
 * through NLDD's components without reaching into their internals.
 */
export const captureField = (page: Page) => page.getByRole('textbox', { name: 'Capture' });

export async function capture(page: Page, text: string): Promise<void> {
  await captureField(page).fill(text);
  await captureField(page).press('Enter');
  await expect(row(page, text.replace(/\s@\S+$/, ''))).toBeVisible();
}

/** The row of an item in the list on screen. */
export const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

export const heading = (page: Page, text: string) => page.getByRole('heading', { name: text, level: 1 });

export const openList = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name });

/** Raw app data, straight from localStorage. */
export const storedItems = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('gtd:data') ?? '{"items":[]}') as { items: { title: string; deletedAt?: number }[] }).items);
```

#### `e2e/capture.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { capture, captureField, row, storedItems } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('captures into the inbox, with a context tag @phone', async ({ page }) => {
  await capture(page, 'Buy milk @errands');
  await expect(row(page, 'Buy milk').getByText('@errands')).toBeVisible();
  await expect(captureField(page)).toHaveValue('');
});

test('the Add button submits too @phone', async ({ page }) => {
  await captureField(page).fill('Tapped');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(row(page, 'Tapped')).toBeVisible();
});

test('never splits an email address into a context', async ({ page }) => {
  await capture(page, 'Email jan@minbzk.nl');
  expect((await storedItems(page))[0].title).toBe('Email jan@minbzk.nl');
});

test('c focuses the capture field from anywhere', async ({ page }) => {
  await page.getByRole('heading', { level: 1, name: 'Inbox' }).click();
  await page.keyboard.press('c');
  await page.keyboard.type('Typed after pressing c');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Typed after pressing c')).toBeVisible();
});
```

#### `e2e/workflow.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { capture, heading, openList, row } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('clarify, complete, and undo with the keyboard', async ({ page }) => {
  await capture(page, 'Call dentist');
  await page.getByRole('button', { name: 'Next: Call dentist' }).click();
  await expect(row(page, 'Call dentist')).toBeHidden();

  await openList(page, 'Next actions').click();
  await expect(heading(page, 'Next actions')).toBeVisible();
  await page.getByRole('button', { name: 'Done: Call dentist' }).click();

  await page.keyboard.press('5');
  await expect(page).toHaveURL(/\/done$/);
  await expect(row(page, 'Call dentist')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(row(page, 'Call dentist')).toBeHidden();
  await page.keyboard.press('2');
  await expect(row(page, 'Call dentist')).toBeVisible();
});

test('delete, then undo from the notification', async ({ page }) => {
  await capture(page, 'Oops');
  await page.getByRole('button', { name: 'Delete "Oops"' }).click();
  await expect(row(page, 'Oops')).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Oops')).toBeVisible();
});

test('the URL is the source of truth for the view', async ({ page }) => {
  await page.goto('/waiting');
  await expect(heading(page, 'Waiting for')).toBeVisible();

  await page.goto('/does-not-exist');
  await expect(page).toHaveURL(/\/inbox$/);

  await openList(page, 'Someday / maybe').click();
  await page.goBack();
  await expect(heading(page, 'Inbox')).toBeVisible();
});
```

#### `e2e/persistence.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { capture, row, storedItems } from './helpers.ts';

test('items survive a reload', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Still here');
  await page.reload();
  await expect(row(page, 'Still here')).toBeVisible();
});

test('step-1 data is upgraded on first load', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gtd:items', JSON.stringify([{ id: 'a', title: 'From step 1', status: 'inbox', createdAt: 1, updatedAt: 1 }]));
  });
  await page.reload();
  await expect(row(page, 'From step 1')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtd:data')!).schemaVersion)).toBe(2);
});

test('a second tab sees captures from the first', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await capture(page, 'From tab A');
  await expect(row(other, 'From tab A')).toBeVisible();
});

test('data from a newer version makes the app read-only', async ({ page }) => {
  await page.goto('/');
  const newer = JSON.stringify({ schemaVersion: 99, items: [] });
  await page.evaluate((value) => localStorage.setItem('gtd:data', value), newer);
  await page.reload();
  await expect(page.getByText(/saved by a newer version/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('gtd:data'))).toBe(newer);
});

test('unreadable data is set aside, and the app keeps working', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtd:data', '{oops'));
  await page.reload();
  await expect(page.getByText('Your saved data could not be read.')).toBeVisible();
  await capture(page, 'After the damage');
  expect((await storedItems(page)).map((i) => i.title)).toEqual(['After the damage']);
});
```

#### `e2e/backup.spec.ts`

```ts
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { capture, row } from './helpers.ts';

test('export, wipe, import: everything comes back, and import is undoable', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'Worth keeping');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gtd-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8'));
  expect(file.version).toBe(2);
  await expect(page.getByText('Last export: today.')).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('gtd:data'));
  await page.reload();
  await expect(row(page, 'Worth keeping')).toBeHidden();

  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByText('Imported: 1 new, 0 updated, 0 deleted.')).toBeVisible();
  await expect(row(page, 'Worth keeping')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Worth keeping')).toBeHidden();
});

test('a file that is not a backup is refused with a reason', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await expect(page.getByText(/does not look like a Personal GTD backup/)).toBeVisible();
});
```
