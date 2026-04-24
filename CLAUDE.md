# CLAUDE.md

Guidance for Claude Code when working in the Notesnook monorepo. Keep changes minimal, focused, and aligned with the project's existing conventions.

## Project

End-to-end encrypted note-taking app. Monorepo hosting web, desktop (Electron), mobile (React Native), a shared `core` package, a shared `editor`, and supporting libraries. Full structure in [README.md](./README.md).

| Path                          | What lives there                                     |
| ----------------------------- | ---------------------------------------------------- |
| `apps/web`                    | Vite + React web client                              |
| `apps/desktop`                | Electron wrapper (main process + Node APIs)          |
| `apps/mobile`                 | React Native app (Android + iOS)                    |
| `packages/core`               | Platform-independent business logic (DB, sync, api) |
| `packages/editor`             | TipTap-based editor + extensions                     |
| `packages/editor-mobile`      | Thin wrapper around `editor` for RN WebView         |
| `packages/crypto`, `sodium`   | Encryption primitives (libsodium)                   |
| `packages/streamable-fs`      | IndexedDB-backed streaming fs                        |
| `packages/theme`, `ui`, `intl`| Shared theming, UI primitives, i18n                 |

## Tooling

- **Package manager: NPM.** Do not use yarn or pnpm, even if `packageManager` in root `package.json` suggests otherwise. The README is authoritative.
- **Node:** pinned via Volta to `22.20.0`.
- **TypeScript:** hybrid codebase — new code must be TS; don't port legacy JS unless asked.
- **Task runner:** every cross-package command routes through `npm run tx <project>:<task>` (see `scripts/execute.mjs`). Convenience scripts in the root `package.json` wrap the common ones.

## Common commands

Run from the repo root.

| Task                              | Command                                |
| --------------------------------- | -------------------------------------- |
| Bootstrap (install + build deps)  | `npm run bootstrap`                    |
| Start web dev server              | `npm run start:web`                    |
| Start desktop                     | `npm run start:desktop`                |
| Start Android                     | `npm run start:android`                |
| Start iOS                         | `npm run start:ios`                    |
| Test core                         | `npm run test:core`                    |
| Test web                          | `npm run test:web`                     |
| Lint everything                   | `npm run lint`                         |
| Lint changed only                 | `npm run linc`                         |
| Format                            | `npm run prettier`                     |

Per-package tests / builds: use `npm run tx <pkg>:<task>` — e.g., `npm run tx core:test`, `npm run tx desktop:build`.

## Commit & branch rules (hard requirements)

Per [CONTRIBUTING.md](./CONTRIBUTING.md):

1. **All commits must include a DCO sign-off.** Use `git commit -s` (or set `commit.gpgsign`/signoff git hook). Format: `Signed-off-by: Your Name <email>`.
2. **Every commit message must start with a scope.** Valid scopes: `mobile`, `web`, `desktop`, `crypto`, `editor`, `logger`, `theme`, `config`, `ci`, `setup`, `docs`, `misc`, `global`. Example: `desktop: fix regexp function registration`.
3. **Never push directly to upstream `master`.** The `origin` remote here points at a personal fork (`madhavmadupu/notesnook`); upstream is `streetwriters/notesnook`. PRs target upstream `master`. There are no release branches.
4. **Before pushing:** `npm run linc && npm run prettier && <relevant tests>` must all pass.

When asked to commit, do not add the `Co-Authored-By: Claude` line — the project's DCO / sign-off workflow doesn't expect it.

## Architecture notes worth knowing

- **Database layer** lives in `packages/core/src/database` and is shared across all clients via `@streetwriters/kysely`. Each client provides its own SQLite adapter:
  - `apps/web`: `wa-sqlite` (WASM, bundles `_sqlite3_regexp_init`)
  - `apps/desktop`: `better-sqlite3-multiple-ciphers` (native; `regexp` is a JS-registered function in `apps/desktop/src/api/sqlite-kysely.ts`)
  - `apps/mobile`: see the mobile SQLite adapter under `apps/mobile`
- **Search** (`packages/core/src/api/lookup.ts`) uses both FTS5 (via `sqlite3-fts5-html` + `sqlite-better-trigram` extensions) and a regexp fallback. If you touch search, be aware every platform must implement the same SQL operators.
- **Editor** runs inside a WebView on mobile via `packages/editor-mobile`. Don't assume DOM APIs in the editor package itself — the mobile wrapper bridges them.
- **Crypto** must stay in `packages/crypto` / `packages/sodium`. Never implement ad-hoc crypto in app code.

## When editing

- Prefer editing existing files over creating new ones — especially docs.
- The desktop ESM + CJS dist outputs (`apps/desktop/dist/{esm,cjs}`) are built by a watcher from `apps/desktop/src`. Edit the TS source, not the dist.
- Desktop dev loads modules from `http://localhost:3000/@fs/...` — a Vite dev server fronting the renderer. Errors reference the compiled `dist/esm/*.js`; the fix goes in the `src/*.ts` counterpart.
- Don't add `Co-Authored-By` trailers or "Generated with Claude Code" lines to commits, PRs, or code comments. The project uses DCO sign-off only.
- License header: every new source file in `apps/` and `packages/` gets the GPL-3.0 header — see any existing `.ts` file for the template. `eslint-plugin-license-header` will flag omissions.

<!-- convex-ai-start -->
This fork uses [Convex](https://convex.dev) for sync + file storage (replacing the upstream HTTP sync server). The Convex project lives at `servers/convex/`.

When working on Convex code, **always read `servers/convex/convex/_generated/ai/guidelines.md` first** for rules that override training-data assumptions about Convex APIs. Run `npx convex dev` from `servers/convex/` to regenerate `_generated/` after schema changes.

**E2EE is disabled** on this fork — sync payloads are plaintext. See `servers/convex/README.md` for the milestone plan.
<!-- convex-ai-end -->
