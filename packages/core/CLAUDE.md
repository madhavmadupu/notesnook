# packages/core — CLAUDE.md

Platform-independent business logic shared by web, desktop, and mobile. Runs in Node, browser, and React Native — **do not** import platform APIs here.

## Hard rules

- **No platform globals.** No `window`, `document`, `localStorage`, `fs`, `path`, `electron`, `react-native`. Everything that can't be isomorphic must be injected (see the `Database` constructor in `src/api/index.ts` — storage, crypto, file-system are all pluggable adapters provided by the host app).
- **No crypto implementations.** Import from `@notesnook/crypto` / `@notesnook/sodium`. The crypto boundary is intentional.
- **No direct SQLite driver imports.** The SQLite `exec` / `prepare` interface is abstracted — see `src/database/sql-collection.ts` and `src/database/index.ts`. Host apps provide the concrete driver (`apps/{web,desktop,mobile}`).
- **Migrations are forward-only.** New schema changes go in `src/database/migrations.ts` with a monotonic `version`. Never edit an old migration — add a new one.

## Key files

| File                                          | What it owns                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `src/api/index.ts`                            | The `Database` facade — entry point             |
| `src/api/lookup.ts`                           | Search: FTS5 + regexp fallback + highlighting   |
| `src/database/index.ts`                       | Schema types + DatabaseSchema                   |
| `src/database/migrations.ts`                  | Migration ladder                                 |
| `src/database/fts.ts`                         | FTS5 virtual tables + `rebuildSearchIndex`      |
| `src/database/sql-collection.ts`              | Generic CRUD collection on top of kysely        |
| `src/utils/query-transformer.ts`              | Parses user search queries → FTS + regex tokens |
| `src/sync/`                                   | Cross-device sync protocol                       |

## Search specifics

- User queries go through `transformQuery` → split into `content` / `title` / metadata filters → passed to `ftsQueryBuilder` and `regexQueryBuilder`.
- FTS5 uses `bm25(1.0, 1.0, 10.0)` ranking — changing the weights has UX impact, don't tweak casually.
- `regexQueryBuilder` uses SQL `regexp` operator. This must be registered on every host driver — see `apps/desktop/src/api/sqlite-kysely.ts` and `apps/web/src/common/sqlite/*`. Adding a new operator to either builder means updating every host.

## Sync

- Sync payloads are encrypted on the sending device and stored encrypted on the server. Any new field added to a synced type must travel through the encrypted payload — do not add plaintext fields to sync messages.
- Conflict resolution is last-writer-wins on `dateModified`. Don't introduce server-side merge.

## Tests

`__tests__/` and `__benches__/`. Run: `npm run test:core`. If you touch `lookup.ts` or `fts.ts`, also run `npm run tx core:bench` to confirm no regression on the large-corpus search benchmark.
