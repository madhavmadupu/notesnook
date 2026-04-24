# Sync

Notesnook sync is a client-driven, last-writer-wins protocol on top of (a) an HTTP REST API for blob transfer and (b) a SignalR hub for real-time push. This fork is in the middle of migrating that backend from the upstream sync server to a Convex Cloud deployment under `servers/convex/`.

## Where it lives in the codebase

| Path | Purpose |
| ---- | ------- |
| `packages/core/src/api/sync/` | Sync engine (collector, merger, auto-sync, SignalR client) |
| `packages/core/src/api/user-manager.ts` | Auth + session |
| `packages/core/src/api/token-manager.ts` | Access/refresh token lifecycle |
| `packages/core/src/utils/http.ts` | HTTP client with auth headers |
| `packages/core/src/utils/constants.ts` | API + SSE host URLs |
| `servers/convex/convex/` | Convex backend (this fork) |
| `servers/convex/README.md` | Milestone status for the Convex migration |

## High-level flow

```
  local mutation                       server
 ───────────────────                  ──────────
 1. write row to SQLite
    set synced = false
 2. emit databaseUpdated  ─►  UI re-renders
 3. autoSync tick or manual sync  ─►  Collector reads synced=false
 4. encrypt batch via IStorage
 5. POST /sync/push (encrypted batch) ─────►  server persists blob
 6.                                   ◄──── ACK with server dateModified
 7. Merger flips synced=true locally
 8. SignalR hub pushes "items changed" ─►  Merger runs pull
 9. decrypt, sanitize, upsert
10. emit databaseUpdated
```

Everything is client-side:

- The server never sees cleartext (upstream path) and never runs business logic.
- Conflict resolution is purely `dateModified` based — the later write wins.
- A row flagged `conflicted = true` shows a dialog on the UI; the user picks a side.

## Components in `api/sync`

| Module | Role |
| ------ | ---- |
| `index.ts` | `SyncManager` — public entry, sync orchestration, event emission |
| `sync.ts` | Internal `Sync` class that drives one full cycle |
| `collector.ts` | Walks every collection for `synced = false` rows, emits batches |
| `merger.ts` | Decrypts incoming batches, runs the sanitizer, upserts |
| `auto-sync.ts` | Periodic and idle-driven sync triggers |
| `signalr-hub.ts` | `@microsoft/signalr` connection to the upstream realtime hub |
| `types.ts` | `SyncTransferItem`, `ParsedInboxItem`, progress shapes |

### Cycle

One cycle:

1. `SyncManager.start()` acquires a mutex so concurrent calls coalesce.
2. `Collector` pages through each collection, yields `SyncTransferItem` batches sized to a byte budget.
3. Each item is encrypted by `IStorage.encrypt` using the user's master key.
4. `HTTP POST /sync/push` uploads batches. The server responds with a cursor.
5. `SignalR` subscription receives `"item-updated"` pushes from other devices.
6. Incoming items go through `Merger`: decrypt → sanitize (drop unknown columns) → upsert via Kysely.
7. On finish, `lastSynced` is stored in the `kv` table; `syncCompleted` event fires.

## Real-time push (upstream)

The upstream server maintains a SignalR hub. On successful login the client calls `HubConnectionBuilder().withAutomaticReconnect()` and subscribes to events:

- `itemUpdated` / `itemDeleted` — another device changed a row.
- `sendItems` — the server is pushing a batch it buffered for us.
- `remoteChanged` — a global revision bump.

The client does not rely on SignalR for correctness; if the connection drops, the next `autoSync` tick catches up via HTTP.

## Auth

`UserManager` (`api/user-manager.ts`) and `TokenManager` (`api/token-manager.ts`) handle sign-up, login, email verification, MFA (`mfa-manager.ts`), subscription (`subscriptions.ts`), and logout. Tokens:

- access token (~15m TTL) cached in `kv` under `userSession`,
- refresh token (long-lived) stored wrapped,
- auto-refresh hits `/account/token` when a call returns 401.

Logout clears `IStorage`, `IFileStorage`, the Kysely connection, and the master key in memory.

## Convex backend (this fork)

`servers/convex/` replaces the upstream HTTP sync server. The migration is tracked as a set of milestones in `servers/convex/README.md`:

| Milestone | Scope |
| --------- | ----- |
| **M1** (current) | Scaffold: `users` table stub, `ping` query works |
| **M2** | Notes + content sync |
| **M3** | Remaining collections (notebooks, tags, colors, reminders, relations, …) |
| **M4** | Convex File Storage for attachments |
| **M5** | Live subscriptions (replacing SignalR) + real auth via JWTs from `auth.streetwriters.co` |
| **M6** | Remove the legacy HTTP sync path from `packages/core` |

### Current schema

`servers/convex/convex/schema.ts`:

```ts
export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    createdAt: v.number()
  }).index("byExternalId", ["externalId"])
});
```

The `externalId` is a dev token passed from the client via the `NN_CONVEX_DEV_USER` env var. It is **not** a JWT. It simply segments data during development so two developers can share a Convex deployment without stepping on each other. Real auth lands in M5.

### Current functions

Only `convex/ping.ts` — a sanity query returning `{ status: "pong", at: <timestamp> }`. Verify the backend is up by calling `ping:ping` from the Convex dashboard or a client.

### Development workflow

From `servers/convex/`:

```bash
npm install
npx convex dev   # prompts login, creates a dev deployment, writes .env.local
```

`convex dev` regenerates `servers/convex/convex/_generated/` on every save. Always read `servers/convex/convex/_generated/ai/guidelines.md` before writing Convex code — it overrides common LLM training-data assumptions.

From the repo root you can also run `npm run tx convex:start`.

### Client wiring (coming)

The plan, per `README.md`, is:

1. Expose `NN_CONVEX_URL` in each client build (Vite env for web, electron-builder for desktop, RN env for mobile).
2. Add a Convex client adapter alongside the existing HTTP one in `packages/core/src/api/sync/`.
3. Gate the adapter on the URL being set so the upstream HTTP path remains the default until M6.
4. Replace the SignalR push with a Convex subscription in M5.
5. Remove the HTTP fallback in M6.

### E2EE status

**Off.** The Convex backend in this fork holds plaintext sync payloads. This is deliberate: it simplifies the server migration and lets us build the schema without touching the crypto code. The crypto pipelines (wrapped master key, encrypted SQLite file, attachment chunk encryption) are **still active** on every device, so the only new exposure is in-transit data between the client and the Convex deployment. Do not use this deployment for real user data.

## Conflict resolution

Every entity has a `dateModified`. When the merger upserts a remote row:

```
if (local.dateModified < remote.dateModified) {
  accept remote;
} else if (local.dateModified > remote.dateModified) {
  flag local as synced=false so it re-pushes;
} else if (local.content ≠ remote.content) {
  flag local as conflicted=true;
}
```

The UI observes `conflicted = true` rows and presents a side-by-side resolution dialog (`apps/web/src/dialogs/conflict/` and its mobile counterpart). The user picks one version or keeps both as siblings. Content-conflict detection uses a cheap hash of the content JSON, not a diff — Notesnook deliberately avoids server-side 3-way merge to keep the server stateless.

## Inbox items

`ParsedInboxItem` (in `api/sync/types.ts`) supports incoming items from the web-clipper browser extension and the inbox email address. These arrive through a different endpoint, are owned by the user on login, and are merged into the notes collection like any other remote row.

## Backup as offline sync

If the server is unreachable (e.g. self-hosted gone down), users can round-trip their data through `backup.ts` (see [database.md](./database.md#backup--import)). Backup ZIPs are either encrypted with a user password or plaintext; both include every collection + attachments.

## Observability

Every sync phase emits events on the `event-manager` bus:

- `syncStarted`, `syncProgress`, `syncCompleted`, `syncAborted`
- `syncItemMerged`, `syncItemSkipped`
- `syncError` with a typed error payload

UI stores subscribe to these to surface a progress bar, badge count, and error toast. Tests under `packages/core/__tests__/sync/` simulate merge/conflict scenarios end-to-end against an in-memory Kysely instance.
