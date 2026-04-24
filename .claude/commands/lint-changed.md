---
description: Run prettier and the incremental linter (linc) on the repo — fast pre-push check
---

Run in this order:

1. `npm run prettier` — formats everything via Prettier.
2. `npm run linc` — ESLint with `--cache`, so it only checks changed files.

If `linc` reports errors, try to fix them in place. Do not add `// eslint-disable-next-line` unless the rule genuinely doesn't apply — prefer fixing the code. For license-header errors, copy the GPL-3.0 header from a neighbouring file.

After fixes, re-run both commands until clean. Then `git status` to show what was modified.

$ARGUMENTS
