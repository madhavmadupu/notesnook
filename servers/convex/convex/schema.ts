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

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// M1 scaffold: only the `users` table exists.
// Collections for notes, content, notebooks, tags, etc. land in M2+.
//
// Identity model (M1-M2): `externalId` is a dev user token supplied by the
// client via env (NN_CONVEX_DEV_USER). It is NOT a JWT and gives no real
// auth — it only segments data during development. Wired to real identity
// from auth.streetwriters.co at M5.
export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    createdAt: v.number()
  }).index("byExternalId", ["externalId"])
});
