---
description: Stage and commit the current changes with a DCO sign-off and a scoped message, per CONTRIBUTING.md
---

The project requires every commit to:

1. Start with a valid scope: `mobile`, `web`, `desktop`, `crypto`, `editor`, `logger`, `theme`, `config`, `ci`, `setup`, `docs`, `misc`, or `global`. Format: `<scope>: <short imperative description>`.
2. Include a DCO sign-off trailer (`Signed-off-by: Name <email>`).
3. **Not** include `Co-Authored-By: Claude` or "Generated with Claude Code" trailers.

Workflow:

1. Run `git status` and `git diff` (staged + unstaged) to see what changed.
2. Run `git log --oneline -10` to match the project's commit style.
3. Identify the correct scope from the file paths (e.g., changes under `apps/desktop/` → `desktop:`; changes under `packages/core/` → `core` isn't a valid scope, so think carefully — `core` belongs under `crypto`/`editor`/etc. only when applicable; for generic core changes use `global` or ask).
4. Draft a concise (1-2 sentence) message focused on the **why**, not the what.
5. Stage the specific files the user is asking about (never `git add -A` — the working tree often has unrelated dirty files).
6. Commit with `git commit -s -m "<scope>: <message>"` so the sign-off is appended automatically from `user.name` / `user.email`.
7. If pre-commit hooks fail, fix the underlying issue and create a new commit — do not `--amend` or `--no-verify`.
8. Run `git status` to confirm.

Ask the user before running `git push`. Never push to upstream `streetwriters/notesnook`; `origin` is the personal fork.

$ARGUMENTS
