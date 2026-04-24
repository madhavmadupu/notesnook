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

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserKey } from "./lib/userKey";

// Full-note fields required on upsert. Kept separate from the schema
// validators because schema fields are mostly optional to support
// tombstones — but an upsert caller must send a complete note.
const upsertArgs = {
  id: v.string(),
  title: v.string(),
  headline: v.optional(v.string()),
  contentId: v.optional(v.string()),
  pinned: v.boolean(),
  favorite: v.boolean(),
  localOnly: v.boolean(),
  conflicted: v.boolean(),
  readonly: v.boolean(),
  archived: v.optional(v.boolean()),
  isGeneratedTitle: v.optional(v.boolean()),
  expiryDate: v.object({
    dateModified: v.number(),
    value: v.union(v.number(), v.null())
  }),
  dateCreated: v.number(),
  dateModified: v.number(),
  dateEdited: v.number()
};

export const upsert = mutation({
  args: upsertArgs,
  handler: async (ctx, args) => {
    const userKey = await getUserKey(ctx);

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_userKey_and_id", (q) =>
        q.eq("userKey", userKey).eq("id", args.id)
      )
      .unique();

    if (existing) {
      // Last-writer-wins on dateModified, matching the core sync convention.
      if (existing.dateModified >= args.dateModified) return null;
      await ctx.db.replace(existing._id, {
        userKey,
        ...args,
        deleted: false
      });
      return null;
    }

    await ctx.db.insert("notes", { userKey, ...args, deleted: false });
    return null;
  }
});

export const remove = mutation({
  args: { id: v.string(), dateModified: v.number() },
  handler: async (ctx, args) => {
    const userKey = await getUserKey(ctx);

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_userKey_and_id", (q) =>
        q.eq("userKey", userKey).eq("id", args.id)
      )
      .unique();

    if (existing) {
      if (existing.dateModified >= args.dateModified) return null;
      await ctx.db.patch(existing._id, {
        deleted: true,
        dateModified: args.dateModified,
        dateEdited: args.dateModified
      });
      return null;
    }

    // Tombstone for a delete that arrives before (or without) the create.
    // Keeps sync correct when multiple devices race.
    await ctx.db.insert("notes", {
      userKey,
      id: args.id,
      dateCreated: args.dateModified,
      dateModified: args.dateModified,
      dateEdited: args.dateModified,
      deleted: true
    });
    return null;
  }
});

export const changesSince = query({
  args: {
    since: v.number(),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const userKey = await getUserKey(ctx);
    return await ctx.db
      .query("notes")
      .withIndex("by_userKey_and_dateModified", (q) =>
        q.eq("userKey", userKey).gt("dateModified", args.since)
      )
      .order("asc")
      .paginate(args.paginationOpts);
  }
});
