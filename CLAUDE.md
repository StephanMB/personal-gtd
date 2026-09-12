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
- Adding an OPTIONAL field to a record needs no schema bump: bumping makes
  older builds read-only, and operations copy records with a spread, so an
  unknown field survives a round trip through an older build.
- A new top-level COLLECTION or SECTION does need one. save() writes an
  explicit shape, so an older build silently drops what it does not know.
- Deletions are tombstones (`deletedAt`), never removals. Every change bumps
  `updatedAt`; merge depends on it.
- Operations return failures as values; they don't throw for anything a user
  can cause. A throw is a bug: the store reports it through `onError` and
  answers `internal-error`.
- Data that cannot be read is copied aside before anything overwrites it, and
  the same data is never copied twice.

## NLDD interop
- Register components before the first render (`src/ui/main.tsx` imports
  `nldd.ts` first), or Preact sets attributes instead of properties.
- Booleans are `attr={cond || undefined}`, never `false`.
- Custom-event handlers are lowercase (`ondismiss`), standard ones camelCase.
- A new `<nldd-*>` tag needs its import in `src/ui/nldd.ts`; a test fails
  otherwise, in both directions.
- The page must give `nldd-app-view` a definite height, or the shell collapses
  and the app renders blank.
- `nldd-list type="navigation"` ignores `accessible-label`: set `aria-label` on
  the element itself, or it keeps the component's Dutch default.
- `nldd-button-group` is vertical by default; rows want `orientation="horizontal"`.
- `nldd-top-title-bar` renders an `h1`. One per page.
- NLDD ships breaking changes as patch releases: read its CHANGELOG before
  upgrading, and let the import guard, the accent guard and Playwright catch
  the rest.

## Explaining the app
- The app assumes things about how it is used (inbox oldest first, a project
  with no next action has stopped, export is the only real backup). Every such
  assumption is a candidate for one sentence at the moment it applies, not a
  line in a manual.
- Rules for when a hint applies live in `src/ui/hints.ts` and are pure and
  tested; the wording lives in `copy.ts` like every other string. Say WHY, not
  just how: the how is already on screen.
- One hint at a time, by priority. A hint retires when its control is used or
  it is waved away, and the fact is stored in settings, so it never returns.

## Scope discipline
- The step 4 document is a menu, not a queue. Query features (a view over data
  that already exists) are cheap; entity features (a new record, a migration
  that can never be edited, a new shape in every query) are permanent.
- Build a feature when its absence has been felt three separate times, not when
  it is described. `README.md` lists what this app will never do.
- Every increment includes a deletion pass: what can go now that this exists?
- `npm run budget` fails the build when the first load grows past its budget.
  Raise it deliberately, with a reason, or make the app smaller.

## Why it is like this
See `docs/step-*.md`. Read the relevant step before restructuring anything.
