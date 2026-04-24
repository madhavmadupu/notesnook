# @notesnook/convex-server

Convex backend for this fork. Replaces the upstream HTTP sync server
(`api.notesnook.com`) with a Convex Cloud deployment. **Sync payloads are
plaintext** — end-to-end encryption is intentionally disabled in this fork.
Do not point production users at this.

## Milestone status

- **M1 — scaffold.** `ping` query works. ✅
- **M2 — notes + content backend.** Schema + upsert/remove/changesSince for `notes` and `contents`. ✅
  Client wiring (`ConvexTransport` in `@notesnook/core`) lands in M2b.
- M3 — remaining collections (notebooks, tags, colors, reminders, etc.).
- M4 — Convex File Storage for attachments.
- M5 — live subscriptions + real auth (JWTs from `auth.streetwriters.co`).
- M6 — remove HTTP sync path from `packages/core`.

## First-time setup

From this directory:

```bash
npm install
npx convex dev
```

On first run, `convex dev` will:
1. Prompt you to log in to Convex.
2. Create a dev deployment.
3. Write `CONVEX_DEPLOYMENT=...` to `.env.local` (gitignored).
4. Generate `convex/_generated/` (gitignored — regenerated each run).
5. Print your `CONVEX_URL` — something like `https://<name>.convex.cloud`.

Copy that URL. You'll set it in the Notesnook clients later as
`NN_CONVEX_URL=<url>` (web/desktop) and the platform equivalent on mobile.

## Day-to-day

```bash
npm start            # alias for: convex dev  — watch + push
npm run deploy       # convex deploy  — push to prod deployment
npm run codegen      # regenerate convex/_generated without watching
```

Or from the repo root via the monorepo task runner:

```bash
npm run tx convex:start
```

## Verifying M1

Once `convex dev` is running, in the Convex dashboard function runner
(or from any client), call `ping:ping`. Expected response:

```json
{ "status": "pong", "at": 1700000000000 }
```

If that works, M1 is done.

## Files

| Path                          | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `convex/schema.ts`            | Table definitions (currently: `users`)          |
| `convex/ping.ts`              | Dev sanity query                                |
| `convex/_generated/`          | Auto-generated types (gitignored)               |
| `.env.local`                  | Written by `convex dev` — gitignored            |
| `.env.example`                | Reference — committed                           |
