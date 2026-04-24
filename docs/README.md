# Notesnook — Developer Documentation

This folder is the internal architecture reference for the Notesnook monorepo. It complements the user-facing docs under `docs/help/` and the contribution-focused docs in the repo root (`README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`).

Notesnook is an end-to-end encrypted note-taking application distributed as:

- a **web** client (Vite + React, running in the browser with `wa-sqlite`),
- a **desktop** client (Electron wrapper around the web renderer, backed by `better-sqlite3-multiple-ciphers`),
- an **Android / iOS** client (React Native shell hosting a WebView editor, backed by `react-native-quick-sqlite`),
- a shared **core** package (`@notesnook/core`) containing all business logic, schema, sync, and search,
- and, on **this fork**, a **Convex** backend (`servers/convex/`) that is progressively replacing the upstream HTTP sync server.

## Reading order

If you are new to the codebase, read these in order:

| # | File | What it covers |
| - | ---- | -------------- |
| 1 | [architecture.md](./architecture.md) | High-level system map, monorepo layout, data flow |
| 2 | [packages.md](./packages.md) | Every shared package: core, crypto, sodium, streamable-fs, theme, ui, intl, logger |
| 3 | [database.md](./database.md) | SQLite + Kysely, all collections, migrations, FTS5 search, platform adapters |
| 4 | [encryption.md](./encryption.md) | Crypto primitives, key derivation, vaults, attachment encryption |
| 5 | [sync.md](./sync.md) | Sync engine, SignalR hub, Convex milestones, conflict resolution |
| 6 | [editor.md](./editor.md) | TipTap editor, custom extensions, mobile WebView bridge |
| 7 | [user_interface.md](./user_interface.md) | Cross-platform UI, routing, state management, component catalogue |
| 8 | [desktop.md](./desktop.md) | Electron main process, tRPC IPC, native integrations, updater |
| 9 | [mobile.md](./mobile.md) | React Native app, native modules, navigation, notifications |
| 10 | [build_and_tooling.md](./build_and_tooling.md) | `npm run tx`, Vite, Electron builder, RN build, lint/format |

## Conventions used in these docs

- Paths are written relative to the repo root (e.g. `packages/core/src/api/index.ts`).
- Code references use `file:line` format so you can click into them from most editors.
- Where the upstream behaviour differs from this fork (notably: the Convex backend, disabled E2EE, the right-sidebar in `apps/web`), the fork-specific behaviour is called out explicitly.
- All commits must be DCO-signed and scoped — see `CONTRIBUTING.md`.

## Quick orientation

| Question | Answer |
| -------- | ------ |
| Where does a note's data live? | `notes` + `content` tables in SQLite. See [database.md](./database.md). |
| How is it encrypted? | `@notesnook/crypto` wrapping `@notesnook/sodium` (XChaCha20-Poly1305 + Argon2). See [encryption.md](./encryption.md). |
| How does it sync? | `packages/core/src/api/sync` with a SignalR hub; migrating to Convex in this fork. See [sync.md](./sync.md). |
| How is the editor shared across platforms? | TipTap-based `@notesnook/editor`, wrapped for RN by `@notesnook/editor-mobile` in a WebView. See [editor.md](./editor.md). |
| Where are the cross-package scripts? | `scripts/execute.mjs` (`npm run tx <pkg>:<task>`). See [build_and_tooling.md](./build_and_tooling.md). |
