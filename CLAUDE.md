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

## Why it is like this
See `docs/step-*.md`. Read the relevant step before restructuring anything.
