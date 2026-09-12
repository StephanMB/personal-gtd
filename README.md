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

## Why it does what it does

The app explains itself where it applies: the first time a situation comes up
(a few things piled up, a project with nothing moving it, never having
exported), one sentence appears on the control it is about, with the reasoning
behind it. Use the control or wave it away and it does not come back; what you
have seen is stored with your data, so it travels with a backup.

There is no tutorial, and nothing to read before you start.

## Your data

- Stored in this browser under `gtd:data` (schema version 2), as a document
  of items. Deleted items are kept as hidden markers so that importing an old
  backup can't bring them back.
- **Export regularly.** It is the only real backup: clearing site data wipes
  everything, and Safari deletes storage for sites unused for 7 days.
  Export/import is in the sidebar; import merges and never removes.
- Unreadable data is never overwritten: it is set aside, the app says so, and
  the sidebar offers it back under "Recovered data".

## What this will never do

A written no is easier to hold to than an unwritten one. This app will not grow:

- calendar or email integration
- time tracking, estimates or reports
- sharing, collaboration, or anything multi-user
- priorities, flags or colour-coded urgency
- notifications that nag

New features earn their place by being missed three separate times. Capture the
annoyance in the app as an item; most of them die there, which is the point.

## Appearance and language

The sidebar carries two choices: appearance (system, light or dark) and
language (English or Nederlands). Both are stored with your data rather than
in this browser, so they survive a reload, are the same in every tab, and come
back with a backup. Appearance defaults to following the operating system.

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

The image build runs `npm run verify`, so a failing test never becomes an image.

## Docs

`docs/` holds the refactoring plan, one document per step, with the reasoning
behind the current structure. Each is a snapshot of its step: later steps
supersede earlier file layouts (step 1's `src/lib/` no longer exists).
See [`docs/README.md`](docs/README.md).
