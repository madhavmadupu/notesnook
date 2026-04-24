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

// Mirrors `Note` in packages/core/src/types.ts, minus deprecated and
// client-local fields (migrated, remote, synced, topic, tags, color,
// notebooks, locked, deleteReason, dateDeleted/itemType/deletedBy which
// are always null on notes).
//
// Everything except the identity/timestamp triple is optional at the
// schema level so deletion tombstones can omit content fields.
// Non-deleted upserts must populate the full set — enforced by the
// upsert mutation's argument validator, not the schema.
const noteDoc = {
  userKey: v.string(),
  id: v.string(),
  dateCreated: v.number(),
  dateModified: v.number(),
  dateEdited: v.optional(v.number()),

  title: v.optional(v.string()),
  headline: v.optional(v.string()),
  contentId: v.optional(v.string()),
  pinned: v.optional(v.boolean()),
  favorite: v.optional(v.boolean()),
  localOnly: v.optional(v.boolean()),
  conflicted: v.optional(v.boolean()),
  readonly: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  isGeneratedTitle: v.optional(v.boolean()),
  expiryDate: v.optional(
    v.object({
      dateModified: v.number(),
      value: v.union(v.number(), v.null())
    })
  ),

  deleted: v.optional(v.boolean())
};

// Mirrors `UnencryptedContentItem`. `locked` is intentionally absent —
// this fork stores plaintext only.
const contentDoc = {
  userKey: v.string(),
  id: v.string(),
  noteId: v.string(),
  dateCreated: v.number(),
  dateModified: v.number(),
  dateEdited: v.optional(v.number()),

  type: v.optional(v.union(v.literal("tiptap"), v.literal("tiny"))),
  data: v.optional(v.string()),
  localOnly: v.optional(v.boolean()),
  sessionId: v.optional(v.string()),

  deleted: v.optional(v.boolean())
};

export default defineSchema({
  notes: defineTable(noteDoc)
    .index("by_userKey_and_id", ["userKey", "id"])
    .index("by_userKey_and_dateModified", ["userKey", "dateModified"]),

  contents: defineTable(contentDoc)
    .index("by_userKey_and_id", ["userKey", "id"])
    .index("by_userKey_and_noteId", ["userKey", "noteId"])
    .index("by_userKey_and_dateModified", ["userKey", "dateModified"])
});
