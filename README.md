# Personal GTD

A small, local-first Getting Things Done app. Capture thoughts to an inbox,
clarify them into next actions / waiting-for / someday-maybe, and mark them
done. All data lives in the browser's `localStorage` — no backend, no
accounts.

Tag a capture with a context using `@`, e.g. `Buy milk @errands`.

## Stack

[Astro](https://astro.build) static site, built in a two-stage Docker image (`node:24-bookworm-slim` builder →
`nginx-unprivileged:1.27-alpine` runtime).

## Development

```bash
npm install
npm run dev
```

## Build & run with Docker

```bash
docker build -t personal-gtd .
docker run -p 8000:8000 personal-gtd
```

Then open http://localhost:8000.
