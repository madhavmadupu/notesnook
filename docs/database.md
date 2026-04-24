# Database

All persistent state on every Notesnook client lives in a single encrypted SQLite database. Queries are written once, in TypeScript, through [`@streetwriters/kysely`](https://github.com/streetwriters/kysely) (Notesnook's Kysely fork) and executed by whatever SQLite driver the current platform injects. The same schema, the same migrations, and the same SQL run in every client.

## Where it lives in the codebase

| Path | Purpose |
| ---- | ------- |
| `packages/core/src/database/index.ts` | `DatabaseSchema` type + `createDatabase()` factory |
| `packages/core/src/database/migrations.ts` | `NNMigrationProvider`, all numbered migrations |
| `packages/core/src/database/sql-collection.ts` | Generic CRUD built on Kysely |
| `packages/core/src/database/fts.ts` | FTS5 virtual tables & indexing |
| `packages/core/src/database/sanitizer.ts` | Strips unknown columns on upsert |
| `packages/core/src/database/triggers.ts` | SQLite triggers (cascades, FTS sync) |
| `packages/core/src/database/kv.ts` | Key-value store (`lastSynced`, tokens, etc.) |
| `packages/core/src/database/config.ts` | Configuration KV (same physical table) |
| `packages/core/src/database/backup.ts` | Encrypted/plain ZIP export + import |
| `packages/core/src/database/fs.ts` | Attachment filesystem adapter |
| `packages/core/src/collections/*.ts` | Per-entity collection classes |

## Platform adapters

`@notesnook/core` never imports any SQLite library directly. Each client passes a Kysely **dialect** into `database.setup({ dialect })`:

| Platform | Driver | Adapter file |
| -------- | ------ | ------------ |
| Web | `wa-sqlite` (WASM) — single-tab or multi-tab (SharedWorker + OPFS) | `apps/web/src/common/sqlite/` |
| Desktop | `better-sqlite3-multiple-ciphers` (native N-API binding, AES + FTS5-compatible) | `apps/desktop/src/api/sqlite-kysely.ts` |
| Mobile | `react-native-quick-sqlite` | `apps/mobile/app/common/database/sqlite.kysely.ts` |

Every adapter must:

1. Open the database file with a cipher key (`PRAGMA key`) derived from the user's password.
2. Register a JavaScript `REGEXP` function so SQL `col REGEXP 'pattern'` works (used by search fallback).
3. Load the `sqlite-better-trigram` and `sqlite3-fts5-html` extensions **after** decryption, before the first FTS5 query.
4. Expose an async `query`/`exec` pair that Kysely can drive.
5. Cache prepared statements (at least on desktop, where `better-sqlite3` returns a reusable `Statement` handle).

On desktop this is done in `apps/desktop/src/api/sqlite-kysely.ts`:

```ts
class SQLite {
  async open(filePath) {
    this.sqlite = new Database(filePath);
    this.sqlite.function("regexp", { deterministic: true }, (pattern, value) => /* ... */);
  }

  private loadExtensions() {
    this.sqlite.loadExtension(require.resolve("sqlite-better-trigram/..."));
    this.sqlite.loadExtension(require.resolve("sqlite3-fts5-html/..."));
    this.extensionsLoaded = true;
  }
}
```

## Schema at a glance

The canonical schema is the `DatabaseSchema` interface in `packages/core/src/database/index.ts`. It is a union of every table Kysely knows about. `CURRENT_DATABASE_VERSION` in the same file is the migration version (currently in the 6.x range).

### Entity tables

All entities extend a common `BaseItem<T>` shape with these columns:

| Column | Meaning |
| ------ | ------- |
| `id` | BSON ObjectID (see `packages/core/src/utils/id.ts`) |
| `type` | Discriminator (`"note"`, `"notebook"`, …) |
| `dateCreated` | Creation timestamp (ms) |
| `dateModified` | Last local mutation (ms) — the conflict-resolution key |
| `synced` | `true` once the server has acknowledged this version |
| `remote` | `true` if this row originated on another device |
| `deleted` | Soft-delete flag — rows stay so sync can propagate the tombstone |
| `migrated` | Used by data-migrations that rewrite records |
| `conflicted` | `true` if a server version lost to a local version; UI resolves |

### All collections

Each table has a matching collection class that wraps it with entity-specific methods:

| Table / Collection | Source | What it stores |
| ------------------ | ------ | -------------- |
| `notes` | `collections/notes.ts` | Titles, headlines, `contentId`, pinned/favorite/readonly flags |
| `notebooks` | `collections/notebooks.ts` | Notebook names and descriptions; topics live as child notebooks via `relations` |
| `content` | `collections/content.ts` | Rich-text body (TipTap JSON or legacy TinyMCE HTML). Encrypted. 1-to-1 with a note via `contentId` |
| `attachments` | `collections/attachments.ts` | Per-file `hash`, `filename`, `mimeType`, `size`, `iv`/`salt`/`alg`/`key` for AEAD chunks, `dateUploaded` |
| `tags` | `collections/tags.ts` | Flat tag titles |
| `colors` | `collections/colors.ts` | User-defined color palette |
| `reminders` | `collections/reminders.ts` | Scheduled alerts, recurrence patterns, snooze state |
| `relations` | `collections/relations.ts` | Many-to-many edges (note→notebook, note→tag, note→color, note→reminder) |
| `noteHistory` | `collections/note-history.ts` | History *sessions* (when a snapshot was taken) |
| `sessionContent` | `collections/session-content.ts` | Historic content blobs (compressed, lockable) |
| `shortcuts` | `collections/shortcuts.ts` | Pinned sidebar items, with `sortIndex` |
| `vaults` | `collections/vaults.ts` | Vault metadata (wrapped keys — see [encryption.md](./encryption.md)) |
| `settings` | `collections/settings.ts` | Encrypted user preferences (theme, time format, etc.) |
| `monographs` | `collections/monographs.ts` | Published monograph metadata |

Trash is **not a separate table** — it is `deleted = true AND dateDeleted IS NOT NULL` on any entity.

### KV + config tables

`kv` (see `database/kv.ts`) and `config` (see `database/config.ts`) are both typed key-value stores sharing a single physical table. The `kv` keys are reserved for system state (`lastSynced`, `vaultKey`, `userSession`, …); `config` holds user-selectable flags.

### FTS5 virtual tables

Declared in migrations and maintained by triggers:

- `notes_fts(title, headline)` — weighted toward title in BM25
- `content_fts(data)` — HTML body

Indexing uses the trigram tokenizer for prefix-insensitive matching and the `html` tokenizer (from `sqlite3-fts5-html`) to strip markup before indexing.

## The `Database` facade

`packages/core/src/api/index.ts` exposes the single entry point for every client:

```ts
class Database {
  storage: StorageAccessor;      // IStorage — KV + crypto
  fs: FileStorageAccessor;       // IFileStorage — attachment I/O
  crypto: CryptoAccessor;        // NNCrypto wrapper
  compressor: CompressorAccessor;// ICompressor — gzip/brotli
  sql: DatabaseAccessor;         // Kysely instance

  user: UserManager;
  syncer: SyncManager;
  vault: Vault;
  lookup: Lookup;
  backup: Backup;
  migrations: Migrations;
  monographs: Monographs;

  notes: Notes;
  notebooks: Notebooks;
  tags: Tags;
  colors: Colors;
  content: Content;
  attachments: Attachments;
  noteHistory: NoteHistory;
  shortcuts: Shortcuts;
  reminders: Reminders;
  relations: Relations;
  vaults: Vaults;
  monographsCollection: Monographs;
  settings: Settings;
  trash: Trash;

  async setup(options): Promise<void>;
  async init(): Promise<void>;
  async sync(options?): Promise<void>;
  changePassword(password?): Promise<void>;
}
```

Consumer apps `await db.setup({ … })` once, `await db.init()` to run migrations and open the SignalR/Convex connection, then use `db.notes`, `db.tags`, etc. directly.

## Migrations

`packages/core/src/database/migrations.ts` implements Kysely's `MigrationProvider`. Migrations are numbered (strings like `"1"`, `"2"`, `"6"`, `"6.1"`). Version `"1"` creates every base table using a small helper `addBaseColumns(tb)` that attaches the `BaseItem` columns above. Subsequent migrations add tables, indexes, or new columns, and **never** rewrite history destructively.

Data migrations (as opposed to schema migrations) live in `packages/core/src/migrations.ts` and are run by `Migrations` class at the end of `db.init()`. These handle one-off rewrites like:

- synchronizing `dateModified` between a note and its content after old-format imports,
- rewrapping vault keys when the crypto primitive changes,
- recomputing `headline` from content when the extraction algorithm improves.

### How to add a migration

1. Bump `CURRENT_DATABASE_VERSION` in `packages/core/src/database/index.ts`.
2. Add a new migration object to `NNMigrationProvider` keyed by the version string.
3. Write `up()` using Kysely's schema builder (`db.schema.alterTable(…).addColumn(…)`).
4. If you rename or delete a column, add a compensating step to the sanitizer so older clients don't silently drop data during round-tripping.
5. Verify round-trip with `__tests__/db.test.js` + any collection-specific tests.

## Sanitizer

`packages/core/src/database/sanitizer.ts` introspects each Kysely table's declared columns once at startup and then, on every upsert, removes keys that are not in the column set. This is how older clients can safely receive rows from newer clients during sync — unknown columns are dropped instead of throwing.

## Triggers

`packages/core/src/database/triggers.ts` installs SQLite triggers that:

- Keep `notes_fts` / `content_fts` in sync on insert/update/delete of `notes` and `content`.
- Cascade delete `content`, `relations`, and `noteHistory` when a note is deleted.
- Propagate `dateDeleted` onto related content when a note is trashed.

## Search

See [architecture.md](./architecture.md#search-architecture) for the overview. The specifics:

- `packages/core/src/utils/query-transformer.ts` parses a user query into `{ fts: string, regex: RegExp[], filters: QueryFilter[] }`. It supports field operators (`tag:x`, `color:blue`), date ranges (`before:2024-01-01`, `after:yesterday`), and booleans.
- `packages/core/src/api/lookup.ts` assembles a Kysely query: FTS match for the text portion, plain-SQL joins for relation filters, and a `REGEXP` clause for the fallback. Results are wrapped in `VirtualizedGrouping` so the UI can page over them without loading everything into memory.
- Ranking: `bm25(notes_fts, 1.0, 1.0, 10.0)` — the `10.0` weights matches in the `title` column 10× the body.
- Highlights: `snippet()` output from FTS5 is post-processed by `utils/html-parser.ts` to wrap match tokens in `<mark>`.

## Virtualized grouping

Most lists (notes, notebooks, trash) return large result sets. `packages/core/src/utils/virtualized-grouping.ts` lazy-loads them:

1. Runs a lightweight SQL query to get only the IDs + a group key (e.g. month for notes, first letter for tags).
2. Computes group headers and total counts from that.
3. Materialises full rows only for the viewport the UI currently renders, via `item(index)`.
4. Caches a bounded number of chunks.

This is what lets the web and mobile list panes scroll a 100k-note database fluidly.

## Backup / import

`packages/core/src/database/backup.ts` supports three formats:

- **Encrypted backup** — ZIP of one JSON file per collection, each file encrypted with a key derived from a user-supplied password.
- **Plaintext backup** — same structure, no encryption. Warned against in the UI.
- **Legacy backup** — importer for pre-6.0 format.

Import deduplicates by `id`. Conflicts surface through the same UI path as sync conflicts.

## Testing

- `packages/core/__tests__/db.test.js` — schema, init, open/close
- `packages/core/__tests__/notes.test.ts` — note operations
- `packages/core/__tests__/lookup.test.js` — FTS, highlight, grouping
- `packages/core/__tests__/backup.test.js` — round-trip export/import
- `packages/core/__tests__/sync/` — merge and conflict scenarios

Benchmarks: `packages/core/__benches__/lookup.bench.ts`, `notes.bench.ts`, `relations.bench.ts`. Run with `npm run tx core:test` or `npm run tx core:bench`.
