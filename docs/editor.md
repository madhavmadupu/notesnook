# Editor

Notesnook's rich-text editor is [TipTap](https://tiptap.dev) 2.x (on top of ProseMirror), assembled in `@notesnook/editor` with around 44 custom extensions. The same editor bundle renders in every client:

- Web/desktop — `apps/web` imports `@notesnook/editor` directly into the React tree.
- Mobile — `@notesnook/editor-mobile` compiles the same editor into a standalone HTML bundle that the React Native app loads into a `react-native-webview`, with JSON messages as the only bridge between the two worlds.

## Packages

| Package | What it does |
| ------- | ------------ |
| `packages/editor` | TipTap configuration + extensions + toolbar + content surface |
| `packages/editor-mobile` | Thin webapp wrapper: hosts the editor, exposes a message bridge, builds an HTML bundle |

## `@notesnook/editor`

### Source layout

```
packages/editor/src/
├── extensions/        # ~44 custom TipTap extensions (one folder each)
├── toolbar/           # Toolbar components + state + utility helpers
├── components/        # Generic UI (tabs, resizer, action sheet, …)
├── types.ts           # Custom `Editor` class (extends TiptapEditor with a mutex)
└── index.ts           # `useTiptap` hook + top-level exports
```

### The `useTiptap` hook

`packages/editor/src/index.ts` is the single entry point. `useTiptap(options)` returns a configured `Editor` instance:

- accepts all TipTap `EditorOptions`,
- plus `storage` callbacks that let the host app customise behaviour: `openLink`, `downloadAttachment`, `copyToClipboard`, `createInternalLink`, `onDownloadAttachment`, `resolveMention`, …,
- registers the full extension set,
- wires the toolbar through `useToolbarStore`.

Returned `Editor` wraps TipTap's with a small async mutex so concurrent programmatic updates (e.g., "applying a remote sync change while the user types") don't corrupt the document.

### Extensions

`packages/editor/src/extensions/` has one folder per extension. Rough taxonomy:

**Content nodes**
`paragraph`, `heading` (H1–H6), `code-block` (with language-aware syntax highlighting via PrismJS), `blockquote`, `bullet-list`, `ordered-list`, `horizontal-rule`, `table` (with resizable columns, cell selection, headers).

**Inline marks**
`link` (clickable, copyable, internal-link aware), `highlight`, `code-mark`, `font-family`, `font-size`, `text-direction`.

**Task & checklist**
`task-list`, `task-item` (nested), `check-list`, `check-list-item`.

**Rich blocks**
`attachment` (files, audio), `image`, `embed` (iframes), `web-clip`, `audio`, `callout` (info boxes), `date-time` (timestamp), `math` (inline + block, rendered with KaTeX), `outline-list` (hierarchical bullets).

**Editor mechanics**
`block-id` (stable per-node IDs used by search-result highlighting and diffing), `diff-highlighter`, `search-replace`, `search-result`, `clipboard` (paste/copy HTML integration).

Each extension usually has three files:

- `extension-name.ts` — TipTap `Node.create()` / `Mark.create()` definition + keyboard shortcuts,
- `component.tsx` — optional React NodeView for block-level custom rendering,
- `index.ts` — barrel export.

Tables are a good reference: `packages/editor/src/extensions/table/table.ts` builds on `prosemirror-tables` and adds a React NodeView (`component.tsx`) that renders resizable columns and a floating toolbar.

### Serialisation

- **HTML** — ProseMirror's own `getHTMLFromFragment` for saving to `content.data`.
- **Markdown** — opt-in via a toolbar helper; not used as the primary format.
- **Clipboard** — the `clipboard` extension normalises pasted HTML (stripping Office spans, sanitising `<script>`, rewriting image URLs into attachments).

### Toolbar

`packages/editor/src/toolbar/` contains toolbar items that read editor state through `useToolbarStore` (a Zustand store). The toolbar is designed to work in three contexts:

- inline (floating, above selection) on web/desktop,
- fixed (bottom-of-screen) on mobile,
- popup (within dialogs such as embed-picker).

### Theming

The editor reads CSS variables from the host theme (via `@notesnook/theme`'s `ScopedThemeProvider`) so it inherits light/dark and user-selected accent colours without per-extension wiring.

## `@notesnook/editor-mobile`

Separate package because React Native cannot host ProseMirror directly. Strategy: build the editor as a self-contained web app, ship the compiled bundle inside the mobile app, load it into a WebView, and talk to it over JSON messages.

### Source layout

```
packages/editor-mobile/src/
├── App.tsx                 # Root React app (theme provider, tab context)
├── components/editor.tsx   # Wraps useTiptap from @notesnook/editor
├── hooks/                  # useTabStore, useEditorController, useSettings
├── utils/
│   ├── index.ts            # isReactNative(), post(), postAsyncWithTimeout()
│   ├── editor-events.ts    # Message names WebView → RN
│   ├── native-events.ts    # Message names RN → WebView
│   └── commands.ts         # Listeners for native events
├── polyfill.ts             # Buffer, crypto polyfills
└── scripts/build.mjs       # Post-build step: build/ → build.bundle/
```

### The bridge

Communication is JSON over `window.ReactNativeWebView.postMessage`.

#### WebView → RN

`utils/index.ts` exports `post()`:

```ts
post(type: string, value: unknown, tabId?, noteId?, sessionId?) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type,
    value,
    sessionId,
    tabId,
    resolverId,      // set when an async response is expected
    hasTimeout       // set when caller uses postAsyncWithTimeout
  }));
}
```

`utils/editor-events.ts` lists the event names the editor fires at the app:

- `editor-event:content` — HTML changed (the save trigger)
- `editor-event:selection` — cursor/selection range
- `editor-event:title` — title changed
- `editor-event:scroll` — scroll position (used to persist in session)
- `editor-event:newtag`, `editor-event:tag` — tag picker
- `editor-event:filepicker` — request a file-picker
- `editor-event:download-attachment`, `editor-event:preview-attachment`
- `editor-event:link` — open/create a link
- ~20 more for tabs, unlock, fullscreen, TOC, etc.

Async requests (file uploads, attachment decrypt) use `postAsyncWithTimeout`, which stores a resolver on `globalThis.pendingResolvers[id]` and awaits a matching `native:resolve` message.

#### RN → WebView

`utils/native-events.ts` lists the messages the app sends into the editor:

- `native:html` — load/replace note HTML
- `native:updatehtml` — partial update (used for remote sync)
- `native:title`, `native:theme`, `native:status`, `native:attachment-data`
- `native:resolve` — response to an async request

`utils/commands.ts` installs the listener and dispatches to `globalThis.editors[tabId]` / `globalThis.editorControllers[tabId]`.

### Tabs

The editor supports multiple open notes simultaneously. `useTabStore` holds an array of tabs; inactive ones are frozen with `react-freeze` to prevent re-renders. Each tab has:

- a `TiptapEditor` instance registered at `globalThis.editors[tabId]`,
- an `EditorController` at `globalThis.editorControllers[tabId]` that mediates save debouncing, locked-session state, and keyboard focus.

### Global registrations

The mobile app mutates `globalThis` on the WebView to pass fast-changing state without message overhead:

- `globalThis.settings` — device settings
- `globalThis.premium` — paid feature flags
- `globalThis.safeAreaController` — safe-area insets (notch, home indicator)
- `globalThis.editorTitles` — refs to title `<textarea>` nodes per tab
- `globalThis.editorTags` — current tag-picker state
- `globalThis.logger()` — forwards logs to native console
- `globalThis.loadApp()` — called by native once the bundle is ready

### Build output

`packages/editor-mobile/src/scripts/build.mjs`:

1. Runs CRA/webpack to produce `build/`.
2. Copies `build/` → `build.bundle/`, stripping sourcemaps from production.
3. The mobile app consumes `build.bundle/index.html`:
   - Android: packaged into `android_asset/` so the WebView can load `file:///android_asset/index.html`.
   - iOS: bundled as a resource loaded from the app's `Bundle` directory.

### Mobile integration

On the RN side (`apps/mobile/app/screens/editor/`):

- `index.tsx` renders `<WebView source={{ uri: EDITOR_URI }} onMessage={...} ref={...} />`.
- `tiptap/use-editor-events.tsx` is the `onMessage` switch — it parses the message type, calls `@notesnook/core` for saves, updates Zustand, and pushes responses back via `ref.current.injectJavaScript`.
- `tiptap/commands.ts` wraps `injectJavaScript` in typed helpers so callers don't build raw script strings.

## Example: saving a note on mobile

1. User types → TipTap `onUpdate` fires inside the WebView.
2. `EditorController.debounceSave()` waits 300ms.
3. `post(EditorEvents.content, htmlContent, tabId, noteId)`.
4. `window.ReactNativeWebView.postMessage(JSON.stringify(...))` serialises.
5. RN's `onMessage` hands the message to `use-editor-events`.
6. The app calls `db.notes.add({ id: noteId, ... })`, then `db.content.add({ ... })`. Both go through Kysely into SQLite.
7. RN posts `native:status = "saved"` back into the WebView.
8. `commands.ts` flips the toolbar status from "saving…" to "saved".

## Adding an extension

1. Create a folder in `packages/editor/src/extensions/<name>/`.
2. Define the TipTap node/mark in `<name>.ts`. Use `Node.create()` / `Mark.create()` and wire keyboard shortcuts via `addKeyboardShortcuts()`.
3. If the node has custom rendering, add a React NodeView in `component.tsx` and register it via `addNodeView()`.
4. Export from `packages/editor/src/index.ts` by adding it to the extensions list passed to `useTiptap`.
5. If the extension introduces new message types for the RN bridge, add names to `editor-events.ts` and `native-events.ts` in `packages/editor-mobile/` and handle them on both sides.
6. Add tests under `packages/editor/src/extensions/<name>/__tests__/` and update `packages/editor/src/toolbar/` if the extension needs a toolbar button.

## Content portability

Because the editor stores HTML in `content.data`, the exact same string round-trips between platforms — this is how a note edited in Electron renders identically in the mobile WebView. The BLOCK `block-id` extension assigns stable IDs to every block so diffing, search-result highlighting, and session history can reference them across devices without ambiguity.
