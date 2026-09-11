# Step 1: Data safety

Implementation guide for `personal-gtd`. This covers step 1 of the refactoring plan: making sure the app never loses or silently corrupts what you capture. It doesn't restructure the app yet (that's step 2), and it doesn't add features beyond what data safety needs.

**How to use this document.** Work through the sections in order. Each one is a self-contained commit and says what to change, why, and how to check it. You can follow it yourself or hand it to a coding agent as-is. The complete code is in the appendix. It was type-checked in strict mode and exercised in Chromium (see *Verification status* at the end).

---

## 0. Principles

Every change below applies one of these four rules. When you're unsure how to handle an edge case, go back to them.

1. **Never overwrite what you couldn't read.** If saved data is damaged, set it aside before anything can be written over it. Today, one bad parse turns into permanent loss on the next capture.
2. **Never fail silently.** A storage error that only reaches the console is invisible, and in a GTD system an invisible failure is the worst kind: you keep trusting a list that's no longer being saved. Every failure must end up in front of the user, with a way out.
3. **Storage is the source of truth; memory is a cache.** Re-read before every write so a stale tab can't overwrite a fresher one. The one exception is when memory holds changes that storage refused. Then memory is newer and must win.
4. **There is always an exit.** Export has to work even when storage doesn't, and anything exported must be importable again, including recovered raw data.

## End state

```
.dockerignore            NEW   keeps host build state out of the image
Dockerfile               EDIT  lockfile becomes mandatory
src/lib/gtd.ts           EDIT  newId(), isItem(), safer parseCapture()
src/lib/storage.ts       NEW   read/write/quarantine that never throw
src/lib/backup.ts        NEW   export format, import parsing, merge
src/lib/app.ts           EDIT  single commit() path, notices, undo, backup UI
src/pages/index.astro    EDIT  status banner, toast, export/import controls
src/styles/global.css    EDIT  styles for the above
```

Suggested commit sequence: 1.1 → 1.2+1.3 → 1.4+1.5 → 1.6+1.7 → 1.8 → 1.9+1.10. Each commit leaves the app working.

---

## 1.1 Docker build hygiene

**Problem.** The repo has no `.dockerignore`. The Dockerfile runs `npm ci` inside Linux and then `COPY . .`, which copies your Windows `node_modules` over the Linux one. Your local `node_modules` contains Windows-only native bindings (`@rolldown/binding-win32-x64-msvc`, `@esbuild/win32-x64`, `lightningcss-win32-x64-msvc`, …). The build then depends on whose machine ran it. `COPY . .` also sends `.git`, `dist` and `.astro` into the build.

A second, smaller issue: `COPY package.json package-lock.json* ./` makes the lockfile optional, but `npm ci` refuses to run without one. The `*` hides a mistake instead of reporting it clearly.

**Why this is data safety.** It isn't about user data. It's about build integrity: an image built on one machine should behave the same as one built on another. It comes first because it's the cheapest fix with the widest impact.

**Do this.**

1. Create `.dockerignore`:

```gitignore
# Never send host build state into the image: the Linux build must
# install its own dependencies from package-lock.json.
node_modules
dist
.astro

# Not needed to build
.git
.claude
*.log
Dockerfile
.dockerignore
```

2. In `Dockerfile`, change line 4:

```diff
-COPY package.json package-lock.json* ./
+COPY package.json package-lock.json ./
```

Excluding the `Dockerfile` itself is harmless: Docker reads it separately from the build context.

**Check.** Run `docker build --no-cache -t personal-gtd .`. The first lines should report the build context in kilobytes (`transferring context: …kB`), not hundreds of megabytes. `docker run --rm -p 8000:8000 personal-gtd` still serves the app.

---

## 1.2 IDs that work over plain HTTP

**Problem.** `crypto.randomUUID()` only exists in a *secure context* (HTTPS or `localhost`). Run the container on your laptop and open `http://192.168.x.x:8000` from your phone, and `crypto.randomUUID` is `undefined`. Every capture then throws and nothing gets added.

**Why this approach.** `crypto.getRandomValues()` *is* available in insecure contexts and is just as random. Building a version-4 UUID from 16 random bytes is exactly what `randomUUID()` does internally. The ID format is unchanged, so existing data stays compatible.

**Do this.** Add `newId()` to `src/lib/gtd.ts` and use it in `createItem()` instead of `crypto.randomUUID()`. Setting the two bits marks the value as version 4 and variant RFC 4122, so it's a valid UUID and not just random hex. See the full `gtd.ts` in the appendix.

**Check.** See test T11.

---

## 1.3 The capture parser never drops text

**Problem.** The current regex `^(.*?)\s*@(\S+)\s*$` treats any trailing `@something` as a context, even in the middle of a word:

| Input | Today | After |
|---|---|---|
| `Buy milk @errands` | "Buy milk" `@errands` | same |
| `Email jan@minbzk.nl` | "Email jan" `@minbzk.nl` ❌ | "Email jan@minbzk.nl" |
| `@errands` | "" `@errands` ❌ (empty title) | "@errands" |
| `Fix bike @home @weekend` | "Fix bike @home" `@weekend` | same (multi-context is step 2) |

The email case silently changes what you typed. That's data loss at capture time, which is why it belongs in this step.

**Rule.** A context must start the string or follow whitespace. If removing the context would leave an empty title, keep the whole input as the title. *Never drop captured text.*

**Do this.** Replace `parseCapture()` with the version in the appendix (`TRAILING_CONTEXT` regex plus the empty-title guard). Making the tokenizer richer (`+project`, `#tag`, dates) is step 2.

---

## 1.4 Validate what you read

**Problem.** `JSON.parse(raw) as Item[]` is an assertion, not a check. Valid JSON of the wrong shape passes straight through. `{}` makes `items.filter` throw and the page stays empty. An item with `status: "archived"` never shows up in any section and disappears from view.

**Why a hand-written guard and not a schema library.** One interface, six fields: a 15-line type guard has no dependency and is easy to read. When the model grows in step 2 (projects, contexts), switching to a schema library such as Zod or Valibot becomes worth it, because it gives you validation and types from one definition.

**Do this.** Add `STATUSES` and `isItem()` to `gtd.ts` (appendix). `isItem` checks the types, that `status` is a known value, and that the timestamps are finite numbers.

---

## 1.5 A storage module that never throws

**Problem.** `localStorage.getItem` and `setItem` can throw:

- `SecurityError` when site data is blocked by browser settings
- `QuotaExceededError` when the roughly 5 MB per-site quota is full
- In some browsers, even reading the `localStorage` property throws

Today a throw in `getItem` happens while the script loads and takes the whole app down. A throw in `setItem` is an uncaught error, and the UI shows a change that was never saved (a violation of principle 2).

**Design.** Move all storage access into `src/lib/storage.ts`. It returns *results*, not exceptions, so the caller has to handle every outcome and the compiler checks that:

```ts
type ReadResult =
  | { kind: 'empty' }                                          // nothing saved yet
  | { kind: 'ok'; items: Item[]; invalid: number; raw: string } // invalid = entries dropped
  | { kind: 'corrupt'; raw: string }                           // unparsable, or not an array
  | { kind: 'unavailable'; error: unknown };                   // storage threw
```

- `readItems()` is *pure*: it never writes. This matters because it's called before every write (1.6) and on every cross-tab event (1.7). A read with side effects in those places would be a bug waiting to happen.
- `writeItems()` returns `{ ok: true } | { ok: false, error }`.
- `quarantine(raw)` copies unreadable data to `gtd:quarantine:<ISO timestamp>` and returns the key, or `null` if even that failed. That's principle 1 in code.
- `onExternalChange()`, `requestPersistence()`, `readLastExport()` and `writeLastExport()` are used in 1.7, 1.10 and 1.9.

**Why keep the existing key and format.** Everyone's current data lives at `gtd:items` as a bare array. Versioned storage (`{ schemaVersion, items }` plus migrations) is step 2. Doing it now would mean writing a migration while the model is about to change anyway.

**Do this.** Create `storage.ts` from the appendix and remove `loadItems`, `saveItems` and `STORAGE_KEY` from `gtd.ts`.

---

## 1.6 One path for every change

This is the core of the step. Read it carefully.

**Problem.** Today every action mutates the module-level `items` in place and saves the whole array. Three failure modes follow from that: stale tabs overwrite fresh ones, save errors are ignored, and a corrupted store gets overwritten.

**Design.** Every change goes through one function:

```ts
function commit(mutate: (current: Item[]) => Item[]): void {
  if (canWrite && !unsaved) {
    const fresh = readItems();                       // 1. re-read storage
    if (fresh.kind === 'ok' && fresh.invalid === 0) items = fresh.items;
    else if (fresh.kind === 'empty') items = [];
  }
  items = mutate(items);                             // 2. apply the change
  save();                                            // 3. write, and report failure
  render();                                          // 4. show the result
}
```

Why each part:

- **Re-read before write (principle 3).** Parsing a few hundred items takes well under a millisecond. It closes the race where tab B saves and tab A acts before its `storage` event has arrived. The browser gives no ordering guarantee between a click and a storage event.
- **`&& !unsaved` (the exception to principle 3).** If the last save failed, memory holds changes storage doesn't have. Re-reading would overwrite them with the older stored copy. *This was a real bug in the first version of this code, caught in testing:* after a quota failure, the next capture silently dropped the unsaved item.
- **Mutators return a new array** instead of editing in place (`map`/`filter`/spread). Since `items` can be replaced by a fresh read, in-place edits on the old array would be lost or applied to the wrong copy.
- **`invalid === 0`.** If storage suddenly contains unreadable entries, don't adopt a filtered copy, because writing it back would silently delete those entries.

**State flags:**

| Flag | Meaning |
|---|---|
| `canWrite` | `false` when storage is unavailable, or when unreadable data couldn't be quarantined. Writes are skipped. |
| `unsaved` | Memory is ahead of storage. Blocks re-reads and triggers the close-tab warning. |
| `saveFailed` | A save-failure banner is showing and gets cleared by the next successful save. |

**Startup (`boot()`)** handles each `ReadResult`:

| Result | Behaviour |
|---|---|
| `empty` | Start with an empty list. |
| `ok`, `invalid = 0` | Normal. |
| `ok`, `invalid > 0` | Keep the valid items, quarantine the raw data, show a banner. |
| `corrupt` | Start empty, quarantine the raw data, show a banner. |
| `unavailable` | `canWrite = false`. Banner: "nothing will be saved, use Export". |

**If quarantine itself fails** (storage is full, so the copy doesn't fit), writing would destroy the only copy. The app then enters *paused* mode: `canWrite = false` and a banner offers **Download unreadable data** and **Resume saving**. You can keep working in memory. Nothing touches the damaged data until you've downloaded it and chosen to resume.

**On save failure** a banner says the change wasn't saved and offers **Export**. The item stays visible, because it does exist, in memory. The next successful save clears the banner automatically.

**Notices.** There are two regions, both *outside* `#gtd-root`, because `render()` clears that root:

- `#gtd-status` (`role="alert"`): persistent problems. It stays until resolved or dismissed.
- `#gtd-toast` (`role="status"`, `aria-live="polite"`): short confirmations such as Undo, import results and import errors. It hides after 8 s.

**Do this.** Replace the state, persistence and command parts of `app.ts` with the appendix version. `actionButtons`, `renderItem` and `render` are unchanged.

---

## 1.7 Multiple tabs

**Problem.** Capture "call dentist" in tab A, then click anything in tab B (opened earlier), and tab B saves its old list. The dentist item is gone without any sign.

**Design.** Two defences:

1. **Re-read before write** (1.6) makes the *data* correct.
2. **Listen for the `storage` event** so the *screen* is correct too. The browser fires it in every *other* tab of the same site when a key changes. It fires with `key === null` when storage is cleared.

```ts
onExternalChange(() => {
  if (!canWrite || unsaved) return;   // never overwrite memory that's ahead
  const fresh = readItems();
  if (fresh.kind === 'ok' && fresh.invalid === 0) items = fresh.items;
  else if (fresh.kind === 'empty') items = [];
  else return;
  render();
});
```

**Why not `BroadcastChannel`?** The `storage` event already carries exactly the signal needed, with no extra messaging. `BroadcastChannel` becomes useful in step 3, once there's a command bus to broadcast.

---

## 1.8 Undo for delete

**Problem.** One click on ✕ permanently deletes an item, with no confirmation.

**Why undo, not a confirmation dialog.** Confirmation dialogs train you to click "OK" without reading. Undo costs nothing in the common case and saves you in the rare one.

**Design.** `deleteItem` keeps the deleted item in a closure and shows a toast, *Deleted "…". Undo*, for 8 seconds. Undo re-adds the item through `commit` (so it's also safe across tabs), and only if it isn't already there.

**Limits (intentional):** only the most recent delete, not across reloads. Proper soft delete (`deletedAt`) arrives in step 2 together with sync preparation.

---

## 1.9 Export and import

**Problem.** All data lives in one browser's `localStorage`. Clearing site data, switching browsers or a browser storage policy (see *Known limitations*) erases everything. Export is the only real guarantee, and the thing every other safety measure falls back on.

**Export format (versioned from day one):**

```json
{
  "format": "personal-gtd-backup",
  "version": 1,
  "exportedAt": "2026-09-11T18:00:00.000Z",
  "items": [ … ]
}
```

*Why version the file now when storage isn't versioned yet?* Storage can be migrated at any time because the app controls it. Backup files live on your disk indefinitely. A file from today has to stay readable after step 2 changes the model. `format` also stops you from importing an unrelated JSON file by accident.

**Import rules:**

- Accepts a backup file **or a bare array**. A bare array is what a raw `localStorage` dump and the *Download unreadable data* file contain, so recovered data can be repaired by hand and imported through the same path (principle 4).
- Every entry passes `isItem`. Invalid entries are counted and reported, not imported.
- **Merge, never replace.** Items are matched by `id`. New ids are added. For an existing id, the version with the newer `updatedAt` wins. Nothing already in your list is removed. As a result, importing the same file twice changes nothing, and importing an old backup can't roll back newer edits.
- A confirmation shows the numbers first (*"12 new, 3 updated. Nothing in your current list is removed."*).

*Why no "replace all" option?* It's the one import mode that can destroy data, and you don't need it: if you want a clean slate you can clear the list first, which is a deliberate act rather than a checkbox.

**Last-export reminder.** The footer shows "Last export: N days ago" (stored in `gtd:lastExportAt`). This pairs naturally with the GTD weekly review: export as the last item of the review.

**Do this.** Create `backup.ts` from the appendix. Add the export/import wiring in `app.ts` (`exportData`, `importFile`, `setupBackupControls`, `renderBackupInfo`) and the footer controls in `index.astro`.

---

## 1.10 Persistence request and close-tab warning

**`navigator.storage.persist()`.** By default, site storage is "best effort": the browser may evict it under disk pressure. Requesting persistence asks it not to.

- Chrome decides silently, based on how you use the site.
- Firefox shows a permission prompt.

That's why the request is made on the **first capture** and not on page load: a prompt with no context gets refused. It's best effort only: the API exists only in secure contexts, and a refusal changes nothing. Export stays the real safeguard.

**`beforeunload`.** While `unsaved` is true (storage unavailable, paused, or the last save failed), closing the tab triggers the browser's "leave site?" dialog. Everything that exists only in memory is one closed tab away from gone, so this is the last line of principle 2.

---

## 1.11 Markup and styles

In `index.astro`:

- add `#gtd-status` above the form
- add the backup footer below `#gtd-root`
- add `#gtd-toast` outside `<main>`

The CSS is additive (appendix). One detail worth knowing: `.notice` sets `display: flex`, which overrides the browser's default styling for the `hidden` attribute. The explicit `.notice[hidden] { display: none; }` rule is what makes `el.hidden = true` actually hide the notice.

---

## 2. Test script

Run `npm run dev` and open the app in Chrome with DevTools → Console. Run each snippet and compare with the expected result. Between tests, reset with `localStorage.clear(); location.reload()`.

**T1: Parser.** Capture `Email jan@minbzk.nl`, then `@errands`.
✅ Both titles appear exactly as typed, with no context badge.

**T2: Unparsable data.**

```js
localStorage.setItem('gtd:items', '{oops'); location.reload()
```

✅ Banner: *"Your saved data could not be read. A copy was kept … under gtd:quarantine:…"*. Capture something, then run `Object.entries(localStorage)`. The quarantine key still holds `{oops`.

**T3: Partially invalid.**

```js
localStorage.setItem('gtd:items', JSON.stringify([
  {id:'x',title:'ok',status:'next',createdAt:1,updatedAt:1},
  {id:'y',title:'bad',status:'archived'}])); location.reload()
```

✅ "ok" is visible. The banner says 1 item couldn't be read. The raw data is quarantined.

**T4: Wrong shape.**

```js
localStorage.setItem('gtd:items', '{}'); location.reload()
```

✅ The app renders all five sections plus a banner. No blank page.

**T5: Storage full.**

```js
let i=0; for (const n of [1e5,1e3,10,1]) { const c='x'.repeat(n); try { for(;;) localStorage.setItem('fill'+i++, c) } catch {} }
```

Capture an item.
✅ The item is visible and the banner says it couldn't be saved.

Then free the space:

```js
Object.keys(localStorage).filter(k=>k.startsWith('fill')).forEach(k=>localStorage.removeItem(k))
```

Capture another item.
✅ The banner disappears, and *both* items are stored (check `localStorage.getItem('gtd:items')`).

**T6: Paused mode.**

```js
localStorage.setItem('gtd:items', '{broken' + 'y'.repeat(2e5));
let i=0; for (const n of [1e5,1e3,10,1]) { const c='x'.repeat(n); try { for(;;) localStorage.setItem('fill'+i++, c) } catch {} }
location.reload()
```

✅ Banner: *"Saving is paused…"*.

Next:

1. Capture an item. `gtd:items` still starts with `{broken`.
2. Click **Download unreadable data**. A file downloads.
3. Free the space (T5 snippet).
4. Click **Resume saving**.

✅ Your item is stored and the banner is gone.

**T7: Storage blocked.** Go to `chrome://settings/content/siteData` → *Don't allow sites to save data*, or add a block rule for `localhost`. Reload.
✅ Banner: *"Browser storage is unavailable…"*. Capturing still works in memory. Closing the tab asks for confirmation.

Undo the setting afterwards.

**T8: Two tabs.** Open the app in two tabs.

1. Capture in tab A. Tab B shows the item without reloading.
2. Capture in tab B.

✅ Both items exist in both tabs and in storage.

**T9: Undo.** Delete an item. Click **Undo** within 8 s.
✅ The item is back, stored, and keeps its original timestamps.

**T10: Export/import.**

1. Click **Export**. The file `gtd-backup-YYYY-MM-DD.json` downloads, and the footer shows "Last export: today."
2. Clear storage and reload, then **Import…** the file. ✅ *"N new, 0 updated"*.
3. Import the same file again. ✅ *"0 new, 0 updated"*, no duplicates.
4. Import a random `.json` file. ✅ *"Import failed: This does not look like a Personal GTD backup."*

**T11: Plain HTTP (phone).** Run `npm run dev -- --host` and open `http://<laptop-LAN-IP>:4321` on your phone. Windows Firewall may ask to allow Node.
✅ Capturing works. (In the console, `isSecureContext === false` and `typeof crypto.randomUUID === 'undefined'`.)

**T12: Docker.** See 1.1.

---

## 3. Known limitations (deliberately left for later steps)

- **Whole-list writes.** While a tab is `unsaved`, it stops following other tabs. When saving recovers, that tab's copy overwrites changes other tabs made in the meantime. This needs a save failure *and* concurrent edits in another tab, so it's rare. Per-record storage (IndexedDB) or deletion markers fix it properly. → Step 2/3.
- **Import can bring back deleted items.** Without deletion markers, an item deleted after the backup was made comes back on import. → Step 2 (`deletedAt`).
- **Undo is shallow:** last delete only, 8 seconds, not across reloads. → Step 3 (command-based undo).
- **Quarantine keys are never cleaned up automatically.** They should be rare. Remove one after recovery with `localStorage.removeItem('gtd:quarantine:…')`.
- **Safari.** With Intelligent Tracking Prevention, WebKit deletes all script-writable storage (including `localStorage`) for a site you haven't used in Safari for 7 days. Web apps added to the home screen are exempt. Until the app is an installable PWA (later step), use it in Chrome or Firefox on iOS, or export regularly.
- **Storage quota:** about 5 MB per site. That's several thousand items, and it becomes relevant only once notes and reference material arrive (→ IndexedDB).
- **`window.confirm` for import** blocks the page and looks dated. It's fine until the UI rework.

---

## 4. Verification status

What was checked before this document was written:

- **Type-checked** in strict mode (`tsc --strict`, TypeScript 6.0, DOM libs).
- **Unit checks** passed for:
  - `parseCapture` (7 cases, including the table in 1.3)
  - the `newId` fallback, which produces a valid v4 UUID with `randomUUID` removed
  - `isItem`
  - `parseBackup`: backup file, bare array, wrong version, non-JSON, foreign JSON
  - `mergeItems`: add, idempotent re-import, older loses, newer wins
- **Browser scenarios** in headless Chromium against a bundled build of this code, all passing: T1–T6, T7 (simulated by making `localStorage` throw), T8 (including the forced race), T9, T10, and T11 (served on a non-localhost address, confirmed `isSecureContext === false`).

**Not verified:**

- `astro build` and the Docker build. The sandbox couldn't download packages from npm.
- Your project uses TypeScript 7 through Astro's strict config. The code uses nothing version-specific, but run `npm run build` once after applying it.

---

## Appendix: complete files

### `.dockerignore`

```gitignore
# Never send host build state into the image: the Linux build must
# install its own dependencies from package-lock.json.
node_modules
dist
.astro

# Not needed to build
.git
.claude
*.log
Dockerfile
.dockerignore
```

### `src/lib/gtd.ts`

```ts
export type Status = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export const STATUSES: readonly Status[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

export interface Item {
  id: string;
  title: string;
  context?: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
}

/** Runtime check for data we did not produce in this session (storage, imports). */
export function isItem(value: unknown): value is Item {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.title === 'string' &&
    (v.context === undefined || typeof v.context === 'string') &&
    typeof v.status === 'string' &&
    (STATUSES as readonly string[]).includes(v.status) &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    typeof v.updatedAt === 'number' &&
    Number.isFinite(v.updatedAt)
  );
}

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

// A context is a trailing "@word" that starts the string or follows whitespace,
// so "jan@minbzk.nl" is never split.
const TRAILING_CONTEXT = /^(.*?)(?:^|\s)@(\S+)\s*$/;

// "Buy milk @errands" -> { title: "Buy milk", context: "errands" }
// Rule: never drop captured text. If stripping the context would leave an
// empty title, keep the whole input as the title.
export function parseCapture(input: string): { title: string; context?: string } {
  const trimmed = input.trim();
  const match = trimmed.match(TRAILING_CONTEXT);
  if (match && match[1].trim() !== '') {
    return { title: match[1].trim(), context: match[2] };
  }
  return { title: trimmed };
}

export function createItem(input: string): Item {
  const { title, context } = parseCapture(input);
  const now = Date.now();
  return {
    id: newId(),
    title,
    context,
    status: 'inbox',
    createdAt: now,
    updatedAt: now,
  };
}
```

### `src/lib/storage.ts`

```ts
import { isItem, type Item } from './gtd';

export const STORAGE_KEY = 'gtd:items';
const QUARANTINE_PREFIX = 'gtd:quarantine:';

export type ReadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; items: Item[]; invalid: number; raw: string }
  | { kind: 'corrupt'; raw: string }
  | { kind: 'unavailable'; error: unknown };

/** Pure read: never writes, never throws. */
export function readItems(): ReadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { kind: 'unavailable', error };
  }
  if (raw === null) return { kind: 'empty' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw };
  }
  if (!Array.isArray(data)) return { kind: 'corrupt', raw };

  const items = data.filter(isItem);
  return { kind: 'ok', items, invalid: data.length - items.length, raw };
}

export type WriteResult = { ok: true } | { ok: false; error: unknown };

/** Never throws; the caller decides how to tell the user. */
export function writeItems(items: Item[]): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Copy unreadable data aside before anything can overwrite it. Returns the key, or null if that failed too. */
export function quarantine(raw: string): string | null {
  const key = `${QUARANTINE_PREFIX}${new Date().toISOString()}`;
  try {
    localStorage.setItem(key, raw);
    return key;
  } catch {
    return null;
  }
}

/** Fires when ANOTHER tab changes our key (or clears storage). */
export function onExternalChange(callback: () => void): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  });
}

/** Ask the browser not to evict our storage under disk pressure. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    // navigator.storage only exists in secure contexts.
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

const LAST_EXPORT_KEY = 'gtd:lastExportAt';

export function readLastExport(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastExport(timestamp: number): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(timestamp));
  } catch {
    // Not critical: the export itself already succeeded.
  }
}
```

### `src/lib/backup.ts`

```ts
import { isItem, type Item } from './gtd';

const FORMAT = 'personal-gtd-backup';
const VERSION = 1;

interface BackupFileV1 {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  items: Item[];
}

export function serializeBackup(items: Item[], now = new Date()): string {
  const file: BackupFileV1 = { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), items };
  return JSON.stringify(file, null, 2);
}

export function backupFilename(now = new Date()): string {
  return `gtd-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseBackupResult =
  | { ok: true; items: Item[]; invalid: number }
  | { ok: false; error: string };

/**
 * Accepts a backup file, or a bare array (a raw localStorage dump or a
 * quarantined value), so recovered data can be imported the same way.
 */
export function parseBackup(text: string): ParseBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  let candidates: unknown[];
  if (Array.isArray(data)) {
    candidates = data;
  } else if (typeof data === 'object' && data !== null && (data as { format?: unknown }).format === FORMAT) {
    const file = data as { version?: unknown; items?: unknown };
    if (file.version !== VERSION) {
      return { ok: false, error: `Unsupported backup version: ${String(file.version)}.` };
    }
    if (!Array.isArray(file.items)) return { ok: false, error: 'The backup has no item list.' };
    candidates = file.items;
  } else {
    return { ok: false, error: 'This does not look like a Personal GTD backup.' };
  }

  const items = candidates.filter(isItem);
  return { ok: true, items, invalid: candidates.length - items.length };
}

/**
 * Non-destructive merge by id: nothing in `current` is removed; for an id in
 * both, the version with the newer updatedAt wins. Importing the same file
 * twice is a no-op.
 */
export function mergeItems(current: Item[], incoming: Item[]): { items: Item[]; added: number; updated: number } {
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      added++;
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
      updated++;
    }
  }
  return { items: [...byId.values()], added, updated };
}

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

### `src/lib/app.ts`

```ts
import { createItem, type Item, type Status } from './gtd';
import {
  readItems,
  writeItems,
  quarantine,
  onExternalChange,
  requestPersistence,
  readLastExport,
  writeLastExport,
} from './storage';
import { serializeBackup, backupFilename, parseBackup, mergeItems, downloadText } from './backup';

const SECTIONS: { status: Status; label: string }[] = [
  { status: 'inbox', label: 'Inbox' },
  { status: 'next', label: 'Next actions' },
  { status: 'waiting', label: 'Waiting for' },
  { status: 'someday', label: 'Someday / maybe' },
  { status: 'done', label: 'Done' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let items: Item[] = [];
/** False when storage is unavailable, or when unreadable data could not be set aside. */
let canWrite = true;
/** True when there are changes that exist only in memory. */
let unsaved = false;
let saveFailed = false;
let persistenceRequested = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * The single path for every change. Re-reads storage first so a stale copy in
 * this tab can never overwrite what another tab saved in the meantime —
 * unless this tab holds changes that never reached storage: then memory is
 * the newer copy and must win.
 */
function commit(mutate: (current: Item[]) => Item[]): void {
  if (canWrite && !unsaved) {
    const fresh = readItems();
    if (fresh.kind === 'ok' && fresh.invalid === 0) items = fresh.items;
    else if (fresh.kind === 'empty') items = [];
  }
  items = mutate(items);
  save();
  render();
}

function save(): void {
  if (!canWrite) {
    unsaved = true;
    return;
  }
  const result = writeItems(items);
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

/** Keep unreadable data out of harm's way, then tell the user. */
function handleUnreadable(raw: string, what: string): void {
  const download = { label: 'Download unreadable data', run: () => downloadText('gtd-unreadable-data.json', raw) };
  const key = quarantine(raw);
  if (key) {
    showStatus(`${what} A copy was kept in this browser under "${key}".`, [download, dismiss]);
  } else {
    // We could not make a copy, so writing now would destroy the only one.
    canWrite = false;
    showStatus(`${what} Saving is paused so it is not overwritten. Download it first, then resume.`, [
      download,
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
}

function boot(): void {
  const result = readItems();
  switch (result.kind) {
    case 'empty':
      items = [];
      break;
    case 'ok':
      items = result.items;
      if (result.invalid > 0) {
        handleUnreadable(result.raw, `${result.invalid} saved item(s) could not be read and were left out.`);
      }
      break;
    case 'corrupt':
      items = [];
      handleUnreadable(result.raw, 'Your saved data could not be read.');
      break;
    case 'unavailable':
      canWrite = false;
      console.error('[gtd] storage unavailable', result.error);
      showStatus('Browser storage is unavailable, so nothing will be saved. Use Export before closing this tab.', [
        { label: 'Export', run: exportData },
      ]);
      break;
  }

  onExternalChange(() => {
    if (!canWrite || unsaved) return;
    const fresh = readItems();
    if (fresh.kind === 'ok' && fresh.invalid === 0) items = fresh.items;
    else if (fresh.kind === 'empty') items = [];
    else return;
    render();
  });

  window.addEventListener('beforeunload', (event) => {
    if (unsaved) event.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function captureItem(value: string): void {
  commit((current) => [...current, createItem(value)]);
  if (!persistenceRequested) {
    persistenceRequested = true;
    void requestPersistence();
  }
}

function moveItem(id: string, status: Status): void {
  commit((current) =>
    current.map((item) => (item.id === id ? { ...item, status, updatedAt: Date.now() } : item)),
  );
}

function deleteItem(id: string): void {
  const deleted = items.find((item) => item.id === id);
  if (!deleted) return;
  commit((current) => current.filter((item) => item.id !== id));
  showToast(`Deleted "${deleted.title}".`, {
    label: 'Undo',
    run: () => commit((current) => (current.some((i) => i.id === deleted.id) ? current : [...current, deleted])),
  });
}

function exportData(): void {
  downloadText(backupFilename(), serializeBackup(items));
  writeLastExport(Date.now());
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
  const ok = window.confirm(
    `Import ${parsed.items.length} items from "${file.name}"?\n\n` +
      `${preview.added} new, ${preview.updated} updated. Nothing in your current list is removed.${skipped}`,
  );
  if (!ok) return;

  let result = preview;
  commit((current) => {
    result = mergeItems(current, parsed.items);
    return result.items;
  });
  showToast(`Imported: ${result.added} new, ${result.updated} updated.`);
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

/** Persistent banner for problems that need the user's attention. */
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

/** Short-lived confirmation with an optional action (e.g. Undo). */
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

function actionButtons(item: Item): { label: string; status: Status }[] {
  switch (item.status) {
    case 'inbox':
      return [
        { label: '→ Next', status: 'next' },
        { label: '→ Waiting', status: 'waiting' },
        { label: '→ Someday', status: 'someday' },
      ];
    case 'next':
    case 'waiting':
      return [
        { label: '✓ Done', status: 'done' },
        { label: '→ Someday', status: 'someday' },
        { label: '→ Inbox', status: 'inbox' },
      ];
    case 'someday':
      return [
        { label: '→ Next', status: 'next' },
        { label: '→ Inbox', status: 'inbox' },
      ];
    case 'done':
      return [{ label: '↺ Reopen', status: 'next' }];
  }
}

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

  for (const action of actionButtons(item)) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => moveItem(item.id, action.status));
    actions.appendChild(btn);
  }

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'delete-btn';
  del.setAttribute('aria-label', `Delete "${item.title}"`);
  del.addEventListener('click', () => deleteItem(item.id));
  actions.appendChild(del);

  li.appendChild(actions);
  return li;
}

function render(): void {
  const root = document.getElementById('gtd-root');
  if (!root) return;
  root.innerHTML = '';

  for (const section of SECTIONS) {
    const sectionItems = items
      .filter((i) => i.status === section.status)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const details = document.createElement('details');
    details.open = section.status !== 'done';

    const summary = document.createElement('summary');
    summary.textContent = `${section.label} (${sectionItems.length})`;
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'item-list';
    if (sectionItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing here.';
      list.appendChild(empty);
    } else {
      for (const item of sectionItems) {
        list.appendChild(renderItem(item));
      }
    }
    details.appendChild(list);
    root.appendChild(details);
  }
}

function renderBackupInfo(): void {
  const el = document.getElementById('backup-info');
  if (!el) return;
  const last = readLastExport();
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
    fileInput.value = ''; // allow re-importing the same file
    if (file) void importFile(file);
  });
}

boot();
setupCaptureForm();
setupBackupControls();
render();
renderBackupInfo();
```

### `src/pages/index.astro`

```astro
---
import '../styles/global.css';
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Personal GTD</title>
  </head>
  <body>
    <main>
      <h1>Personal GTD</h1>
      <div id="gtd-status" class="notice notice-warning" role="alert" hidden></div>
      <form id="capture-form">
        <input
          id="capture-input"
          type="text"
          placeholder="Capture a thought... (try &quot;Buy milk @errands&quot;)"
          autocomplete="off"
        />
        <button type="submit">Add</button>
      </form>
      <div id="gtd-root"></div>
      <footer class="backup-bar">
        <button type="button" id="export-btn">Export</button>
        <button type="button" id="import-btn">Import…</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
        <span id="backup-info"></span>
      </footer>
    </main>
    <div id="gtd-toast" class="notice toast" role="status" aria-live="polite" hidden></div>
    <script src="../lib/app.ts"></script>
  </body>
</html>
```

### `src/styles/global.css` (append to the end)

```css
/* --- Notices & backup bar (step 1: data safety) --- */

.notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.notice[hidden] {
  display: none;
}

.notice span {
  flex: 1 1 16rem;
}

.notice button,
.backup-bar button {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.notice-warning {
  margin-bottom: 1rem;
  border-color: #c77c02;
  background: color-mix(in srgb, #c77c02 12%, transparent);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  width: min(36rem, calc(100% - 2rem));
  box-sizing: border-box;
  background: var(--bg);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
}

.backup-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 2rem;
  font-size: 0.85rem;
  color: #888;
}
```
