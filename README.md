# Chat Archiver

Desktop app for importing, browsing, and backing up chat exports from the
SillyTavern and Marinara Engine "Portable Chat Exporter" extensions.

Built against `chat-archiver-build-spec.md`. This is **Phase 1 —
Scaffolding** (see spec §10 for the full phase list).

## What's here

- Electron + React + TypeScript, built with `electron-vite`.
- `better-sqlite3` wired up in the main process only; `library.db` is
  created and migrated automatically on first launch (`src/main/db`).
- A fully-typed `window.api` bridge (`src/preload/index.ts`) covering
  every IPC channel from spec §5. Channels not yet built (import,
  folder CRUD, chat viewer, trash, backup, tags) are registered as
  explicit "not implemented yet" stubs so the renderer can call them
  today and get a clear error instead of a silent hang — later phases
  just replace the stub with real logic in `src/main/ipc/register.ts`.
- Dark theme CSS variables + a 3-pane SillyTavern-style shell
  (sidebar / chat list / viewer) in `src/renderer/src/App.tsx`.

## Setup

```bash
npm install
npm run dev        # launches the Electron app with hot reload
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit across main + renderer
npm run build       # production build (out/)
npm run package     # electron-builder packaging (Phase 8)
```

## Next phases

See `chat-archiver-build-spec.md` §10. Phase 2 (import pipeline) is next.
