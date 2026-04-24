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

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../common/convex";
import { db } from "../common/db";

const SYNC_INTERVAL_MS = 15_000;
const NOTES_CURSOR_KEY = "convex:syncedNotes";
const CONTENTS_CURSOR_KEY = "convex:syncedContents";

type Cursor = Record<string, number>;

// Naive bridge: every 15s, walk local notes + their content, push anything
// whose dateModified advanced since last push. Also tombstones anything we
// previously pushed that's no longer present locally. Runs alongside (not
// inside) Notesnook core's own sync — the core's upstream transport hits
// api.notesnook.com and fails silently since we're off the Streetwriters
// backend.
//
// Limitations (deliberate for M2b):
//   - No pull: changes made on other devices don't come back to this one.
//   - No attachments, notebooks, tags, colors, reminders, relations.
//   - Locked / encrypted content is skipped.
//   - Tombstone dateModified is "now" rather than the actual deletion time
//     (we don't capture deletion timestamps locally).
export function ConvexSync() {
  const upsertNote = useMutation(api.notes.upsert);
  const removeNote = useMutation(api.notes.remove);
  const upsertContent = useMutation(api.contents.upsert);
  const removeContent = useMutation(api.contents.remove);

  useEffect(() => {
    let cancelled = false;
    let running = false;

    async function syncOnce() {
      if (cancelled || running) return;
      // The local DB is initialized asynchronously by RouteWrapper (a
      // sibling of this component). On first mount the db isn't ready yet
      // — silently skip; the interval will retry.
      if (!db.isInitialized) return;
      running = true;
      try {
        const notesCursor = readCursor(NOTES_CURSOR_KEY);
        const contentsCursor = readCursor(CONTENTS_CURSOR_KEY);

        const localNotes = await db.notes.exportable.items();
        const liveNoteIds = new Set<string>();
        const liveContentIds = new Set<string>();

        for (const note of localNotes) {
          if (cancelled) return;
          liveNoteIds.add(note.id);

          const lastPushed = notesCursor[note.id];
          if (lastPushed === undefined || note.dateModified > lastPushed) {
            try {
              await upsertNote({
                id: note.id,
                title: note.title ?? "",
                headline: note.headline,
                contentId: note.contentId,
                pinned: !!note.pinned,
                favorite: !!note.favorite,
                localOnly: !!note.localOnly,
                conflicted: !!note.conflicted,
                readonly: !!note.readonly,
                archived: note.archived,
                isGeneratedTitle: note.isGeneratedTitle,
                expiryDate: note.expiryDate ?? {
                  dateModified: 0,
                  value: null
                },
                dateCreated: note.dateCreated,
                dateModified: note.dateModified,
                dateEdited: note.dateEdited
              });
              notesCursor[note.id] = note.dateModified;
            } catch (e) {
              console.warn("[convex-sync] note upsert failed", note.id, e);
            }
          }

          if (note.contentId && !note.localOnly) {
            liveContentIds.add(note.contentId);
            const content = await db.content.get(note.contentId);
            if (!content || content.locked) continue;
            const lastC = contentsCursor[content.id];
            if (lastC === undefined || content.dateModified > lastC) {
              try {
                await upsertContent({
                  id: content.id,
                  noteId: content.noteId,
                  type: content.type,
                  data: typeof content.data === "string" ? content.data : "",
                  localOnly: !!content.localOnly,
                  sessionId: content.sessionId,
                  dateCreated: content.dateCreated,
                  dateModified: content.dateModified,
                  dateEdited: content.dateEdited
                });
                contentsCursor[content.id] = content.dateModified;
              } catch (e) {
                console.warn(
                  "[convex-sync] content upsert failed",
                  content.id,
                  e
                );
              }
            }
          }
        }

        // Tombstone anything we previously pushed that's no longer local.
        for (const id of Object.keys(notesCursor)) {
          if (liveNoteIds.has(id)) continue;
          try {
            await removeNote({ id, dateModified: Date.now() });
            delete notesCursor[id];
          } catch (e) {
            console.warn("[convex-sync] note remove failed", id, e);
          }
        }
        for (const id of Object.keys(contentsCursor)) {
          if (liveContentIds.has(id)) continue;
          try {
            await removeContent({ id, dateModified: Date.now() });
            delete contentsCursor[id];
          } catch (e) {
            console.warn("[convex-sync] content remove failed", id, e);
          }
        }

        writeCursor(NOTES_CURSOR_KEY, notesCursor);
        writeCursor(CONTENTS_CURSOR_KEY, contentsCursor);
      } finally {
        running = false;
      }
    }

    // Poll quickly at first (until DB is ready), then settle into the
    // slower cadence. The first effective sync fires as soon as
    // db.isInitialized flips true.
    let fastPoll: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (cancelled) return;
      if (db.isInitialized) {
        if (fastPoll) {
          clearInterval(fastPoll);
          fastPoll = null;
        }
        syncOnce();
      }
    }, 250);
    const slowPoll = setInterval(syncOnce, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (fastPoll) clearInterval(fastPoll);
      clearInterval(slowPoll);
    };
  }, [upsertNote, removeNote, upsertContent, removeContent]);

  return null;
}

function readCursor(key: string): Cursor {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeCursor(key: string, cursor: Cursor) {
  localStorage.setItem(key, JSON.stringify(cursor));
}
