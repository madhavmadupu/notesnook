# apps/desktop — CLAUDE.md

Electron wrapper for Notesnook. The renderer is the web client (`apps/web`) served via Vite during dev; the main process lives here.

## Build + run

- `npm run start:desktop` from repo root (not from here) — spins up the web dev server + Electron shell. Dev renderer URL: `http://localhost:3000`.
- `npm run tx desktop:build` — production build.
- Source is TS under `src/`, compiled to both `dist/esm/` and `dist/cjs/` by a watcher. **Edit `src/`, never `dist/`** — dist writes get clobbered by the watcher.

## Database layer (`src/api/sqlite-kysely.ts`)

- Driver: `better-sqlite3-multiple-ciphers` (native, unlike web which uses wa-sqlite).
- `regexp` is not built in — it is registered as a JS function in `open()`. Any code path that relies on a SQL function not in the SQLite standard must also be registered here (grep for `this.sqlite.function(`).
- FTS5 extensions (`sqlite-better-trigram`, `sqlite3-fts5-html`) load via `loadExtensions()` **after** `PRAGMA key` decrypts the DB. Do not move this earlier — SQLite3MC v2.0.2 broke pre-key extension loading.
- Prepared statements are cached in `preparedStatements: Map<string, Statement>`. Long-lived — any statement that references a stale schema after a migration must be invalidated or the Map cleared.
- When an error path throws, `rewriteError` attaches the SQL to the message for debuggability — keep that behavior.

## Electron-specific rules

- Main-process code only: no DOM, no `window`, no `document`. The renderer is a separate process.
- IPC goes through `electron-trpc` — add procedures, don't use raw `ipcMain.handle` (keeps typed client generation working).
- `safe-storage.ts` wraps Electron's `safeStorage` for OS-keyring-backed secrets. Never write credentials / keys via `fs.writeFile`.
- Platform differences (win32 / darwin / linux) are handled in `os-integration.ts` and `window.ts`. If you branch on `process.platform`, check whether the file already has a helper.
- The auto-updater (`updater.ts`) uses `electron-updater`; do not bypass it for ad-hoc update flows.

## Patches

`patches/` contains `patch-package` diffs applied on install. If you see behavior that contradicts a node_module's public source, check here first.

## Tests

`__tests__/` + `vitest.config.ts`. Run with `npm run tx desktop:test`.
