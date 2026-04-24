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

const upsertArgs = {
  id: v.string(),
  noteId: v.string(),
  type: v.union(v.literal("tiptap"), v.literal("tiny")),
  data: v.string(),
  localOnly: v.boolean(),
  sessionId: v.optional(v.string()),
  dateCreated: v.number(),
  dateModified: v.number(),
  dateEdited: v.number()
};

export const upsert = mutation({
  args: upsertArgs,
  handler: async (ctx, args) => {
    const userKey = await getUserKey(ctx);

    const existing = await ctx.db
      .query("contents")
      .withIndex("by_userKey_and_id", (q) =>
        q.eq("userKey", userKey).eq("id", args.id)
      )
      .unique();

    if (existing) {
      if (existing.dateModified >= args.dateModified) return null;
      await ctx.db.replace(existing._id, {
        userKey,
        ...args,
        deleted: false
      });
      return null;
    }

    await ctx.db.insert("contents", { userKey, ...args, deleted: false });
    return null;
  }
});

export const remove = mutation({
  args: { id: v.string(), dateModified: v.number() },
  handler: async (ctx, args) => {
    const userKey = await getUserKey(ctx);

    const existing = await ctx.db
      .query("contents")
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

    await ctx.db.insert("contents", {
      userKey,
      id: args.id,
      // The noteId on a tombstone is unknown if the row never existed —
      // empty string is a safe placeholder; clients filter on `deleted`
      // and use the content id only to reconcile the note's contentId field.
      noteId: "",
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
      .query("contents")
      .withIndex("by_userKey_and_dateModified", (q) =>
        q.eq("userKey", userKey).gt("dateModified", args.since)
      )
      .order("asc")
      .paginate(args.paginationOpts);
  }
});
