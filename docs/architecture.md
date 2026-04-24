# Architecture

Notesnook is a privacy-first, end-to-end encrypted note-taking suite. Everything the user types is encrypted **on device** with `XChaCha20-Poly1305` keys derived from an `Argon2` password hash before leaving the machine. All three clients (web, desktop, mobile) share a single TypeScript business-logic package (`@notesnook/core`) and a single TipTap-based editor (`@notesnook/editor`). The physical differences between platforms are pushed down to narrow adapters: a SQLite driver, a filesystem driver, a crypto provider, and a compressor.

```
                 ┌────────────────────────────────────────────────────────────┐
                 │                       @notesnook/core                      │
                 │  Database (Kysely)  Sync  Lookup  Vault  Users  Backup     │
                 │         ↑                ↑                ↑                │
                 │         │                │                │                │
                 │   IStorage        IFileStorage      ICompressor            │
                 │ (crypto+KV)      (attachments)      (gzip/br)              │
                 └─────────┬──────────────────┬──────────────┬────────────────┘
                           │                  │              │
                ┌──────────┴───┐     ┌────────┴──────┐  ┌────┴──────┐
                │ wa-sqlite    │     │ better-sqlite3│  │ RN quick- │
                │ (browser)    │     │ (Electron)    │  │ sqlite    │
                └──────────────┘     └───────────────┘  └───────────┘
                       ▲                    ▲                ▲
                 apps/web             apps/desktop       apps/mobile
                 (Vite+React)       (Electron + web)   (React Native + WebView)
                       │                    │                │
                       └──────────┬─────────┘                │
                                  │                          │
                         @notesnook/editor  ────────── @notesnook/editor-mobile
                          (TipTap + ~44 exts)          (HTML bundle + RN bridge)
```

## Monorepo layout

| Path | What lives there |
| ---- | ---------------- |
| `apps/web` | Vite + React web client |
| `apps/desktop` | Electron main-process wrapper + build config; renderer *is* `apps/web` |
| `apps/mobile` | React Native app (Android + iOS) |
| `apps/monograph` | Public-note reader (Monographs) |
| `apps/vericrypt` | Standalone crypto-claim verifier |
| `apps/theme-builder` | Theme editor UI |
| `packages/core` | Platform-independent business logic: DB, sync, API, search |
| `packages/editor` | TipTap editor + ~44 extensions |
| `packages/editor-mobile` | Thin WebView wrapper around `editor` for the mobile app |
| `packages/crypto` | `NNCrypto` facade (XChaCha20-Poly1305 + Argon2) |
| `packages/sodium` | Isomorphic libsodium (native bindings in Node, WASM in browser) |
| `packages/streamable-fs` | Streaming IndexedDB "filesystem" for large attachments |
| `packages/theme` | Theme engine + built-in themes |
| `packages/ui` | Shared UI primitives |
| `packages/intl` | Lingui-based i18n (catalogues + runtime) |
| `packages/logger` | Pluggable logger with scopes |
| `packages/clipper` | Page-clipping core shared by the web extension |
| `extensions/web-clipper` | Browser extension entry |
| `servers/convex` | Convex backend (this fork; replaces the upstream HTTP sync server) |
| `scripts/` | Cross-package task runner (`execute.mjs`) |

## Layered architecture

Notesnook is deliberately three-layered:

1. **Persistence** — SQLite (via Kysely) + an IndexedDB-backed file store for attachments.
2. **Domain / business logic** — `@notesnook/core` exposes a `Database` facade with collections, sync, search, vaults, backup, and user management.
3. **Presentation** — web/desktop/mobile UIs, each binding the same domain layer to its platform-native chrome.

Every cross-layer call goes through an **injected adapter** so the domain layer never imports `window`, `fs`, `electron`, or `react-native`:

- `IStorage` — KV + crypto (web: IndexedDB + SubtleCrypto; desktop: node keytar via safeStorage; mobile: native KV)
- `IFileStorage` — chunked read/write/delete of encrypted files
- `ICompressor` — gzip/brotli
- `SqliteDialect` — Kysely adapter for the platform's SQLite driver

The **Database** class in `packages/core/src/api/index.ts` is the single composition root: `await database.setup({ storage, fs, crypto, compressor, dialect })` wires up everything.

## Data flow: creating a note

1. User clicks **New Note** in the UI (e.g. `apps/web/src/common/index.ts` calls `db.notes.add({ title, content })`).
2. `notes` collection (`packages/core/src/collections/notes.ts`) generates a BSON `id`, persists to SQLite through Kysely.
3. Linked content is stored separately in the `content` table with a reference from `note.contentId`.
4. Sanitizer (`packages/core/src/database/sanitizer.ts`) strips keys not present in the Kysely-introspected schema.
5. Triggers (`packages/core/src/database/triggers.ts`) keep FTS5 tables (`notes_fts`, `content_fts`) in sync.
6. A `databaseUpdated` event is emitted on the `event-manager` bus; UI stores subscribe and re-render.
7. At next sync tick, `SyncManager` (`packages/core/src/api/sync/`) collects rows where `synced = false`, encrypts them via `IStorage`, and uploads to the server (SignalR upstream, or Convex in this fork).
8. Server returns an ACK with the updated `dateModified`; `Collector` flips `synced = true`.

## Data flow: editing a note on mobile

Mobile is the only platform where the editor runs in a separate JavaScript context (a WebView), so the path is longer:

1. User types in the WebView (`packages/editor-mobile/src/components/editor.tsx`).
2. TipTap's `onUpdate` fires and `post(EditorEvents.content, html)` serialises a JSON message and calls `window.ReactNativeWebView.postMessage`.
3. In the RN side (`apps/mobile/app/screens/editor/tiptap/use-editor-events.tsx`), `onMessage` switches on `type` and calls the note save path.
4. Save hits `@notesnook/core`, which writes through the RN SQLite driver (`apps/mobile/app/common/database/sqlite.kysely.ts`, wrapping `react-native-quick-sqlite`).
5. Native sends `NativeEvents.status = "saved"` back into the WebView so the editor updates its "saved" indicator.

## Sync architecture

Two backends coexist during the fork's migration:

- **Upstream**: HTTPS + a SignalR hub (`@microsoft/signalr`) for real-time push, with server-side encrypted blobs — the default, still-shipping path. See `packages/core/src/api/sync/`.
- **This fork**: Convex Cloud at `servers/convex/`. Sync payloads are **plaintext** (E2EE intentionally disabled during migration; do not point production users at it). See [sync.md](./sync.md).

Conflict resolution is last-writer-wins on `dateModified`. No server-side merge. Items are flagged `conflicted = true` only when a remote write lands on a local row that has unsynced changes and differs in content; the UI surfaces a conflict-resolution dialog.

## Search architecture

Search is FTS5 first, regexp fallback:

- Virtual tables `notes_fts` and `content_fts` are populated via SQLite triggers on insert/update/delete.
- Custom SQLite extensions `sqlite-better-trigram` (trigram tokenizer) and `sqlite3-fts5-html` (HTML-aware extraction) are loaded per platform.
- `packages/core/src/utils/query-transformer.ts` parses user input (`tag:foo before:2024-01-01`) into an FTS expression + regexp filter set.
- `packages/core/src/api/lookup.ts` runs the FTS query, ranks with `bm25(1.0, 1.0, 10.0)` (heavy title weighting), and falls back to a `REGEXP` operator (JS function on desktop; WASM function on web) for short tokens or regex input.
- Web registers regexp at WASM init; desktop registers it at `open()` in `apps/desktop/src/api/sqlite-kysely.ts`; mobile registers it inside the quick-sqlite driver.

## Security boundary

- Crypto happens only in `packages/crypto` — it is the **only** module allowed to call libsodium. Callers talk to `NNCrypto`.
- User passwords never leave the device; a master key is derived locally via Argon2id and stored wrapped inside `IStorage`.
- Vault items are doubly encrypted: first with the vault key, then the vault key itself is wrapped by the user's master key.
- Attachments are streaming-encrypted (`crypto_secretstream_xchacha20poly1305`) so files never have to be held in memory.

## Event bus

`packages/core/src/utils/event-manager.ts` is a lightweight pub/sub used across the layers. Key events (defined in `packages/core/src/common.ts`):

- `databaseUpdated` — a collection mutated, UI should re-fetch
- `syncProgress`, `syncCompleted`, `syncAborted`
- `userLoggedIn`, `userLoggedOut`, `userEmailConfirmed`
- `attachmentDeleted`, `attachmentsLoading`
- `userSessionExpired` → forces a re-login flow

Web/desktop/mobile each wrap this bus into platform-idiomatic subscriptions (Zustand + Emitter on web, same on RN).

## Fork-specific deltas

This repo is a downstream fork of `streetwriters/notesnook` and adds:

1. **Convex backend** at `servers/convex/` — see [sync.md](./sync.md) for the M1→M6 migration plan.
2. **Plaintext sync payloads** during the migration window (E2EE off).
3. **Right sidebar** in the web client (`apps/web/src/components/right-sidebar/`) with a Calendar tab and AI Assistant tab.
4. Local tooling: `.agents/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, and `skills-lock.json`.

Upstream (`streetwriters/notesnook`) remains the source of truth for everything else.
