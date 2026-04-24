/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import type { QueryCtx, MutationCtx } from "../_generated/server";

const DEV_USER_KEY = "dev";

// Returns the stable per-user scope key used on every row.
//
// M2–M4: no auth.config.ts is set, so `getUserIdentity()` always returns
// null and every call is scoped to DEV_USER_KEY. This fork's deployment is
// single-user during development — treat the URL as a secret accordingly.
//
// M5 wires auth.streetwriters.co JWTs; the fallback is removed and
// unauthenticated callers start throwing.
export async function getUserKey(
  ctx: QueryCtx | MutationCtx
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? DEV_USER_KEY;
}
