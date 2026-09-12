# Docs

The refactoring plan, one document per step, plus a pass back over all of them.

**These are snapshots, not living documentation.** Each describes the state of
the app at the end of its step and the reasoning behind the decisions taken
there. Later steps supersede earlier file layouts and storage formats; where
that happens, the older document says so at the top. For how the code works
today, read the code and `CLAUDE.md`.

| Document | Covers | Read it for |
|---|---|---|
| [step-1-data-safety.md](step-1-data-safety.md) | Never lose or silently corrupt what you capture | Why storage is read before every write, what quarantine and paused mode are, why export exists |
| [step-2-groundwork.md](step-2-groundwork.md) | Making the app changeable | The domain model, schema versioning and migrations, the repository seam, backup format |
| [step-3-ui.md](step-3-ui.md) | The UI, on Vite, Preact and NLDD | The store and generic undo, the design system and its licence conditions, keyboard rules, end-to-end tests |
| [step-4-functionality.md](step-4-functionality.md) | The feature plan | What is coming and in which order: clarify, projects, dates, contexts, the weekly review |
| [cleanup.md](cleanup.md) | Loose ends from steps 1–3 | What was parked or left half-done, what is fixed, and what is deliberately accepted |

Step 1 and 2 predate the current layout: `src/lib/` no longer exists, and data
lives under `gtd:data` rather than `gtd:items`.
