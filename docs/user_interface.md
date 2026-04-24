# User Interface

Notesnook ships three UIs (web, desktop, mobile). Web and desktop share 99% of their code — the desktop build is the Vite renderer from `apps/web` embedded in Electron. Mobile is a separate React Native app that reuses only the domain layer (`@notesnook/core`) and the editor bundle (`@notesnook/editor-mobile`).

This doc covers the shared patterns: layout, routing, state stores, component organisation, dialogs, theming.

## Platform matrix

| Concern | `apps/web` + `apps/desktop` | `apps/mobile` |
| ------- | --------------------------- | ------------- |
| View layer | React 18, TypeScript, Emotion CSS-in-JS | React Native 0.74+, StyleSheet, Reanimated |
| State | Zustand (~15 stores) | Zustand (~20 stores) |
| Routing | Hash-based (`#/notes/:id/edit`) | React Navigation native stack |
| Layout | `SplitPane` on desktop, stacked slides on mobile browser | Fluid panels, tablet-aware |
| Theme | `@notesnook/theme` + Emotion theme provider | `@notesnook/theme` + native-specific `ScopedThemeProvider` |
| i18n | `@notesnook/intl` (Lingui) | Same |
| Editor | TipTap in the React tree | TipTap in a WebView (`@notesnook/editor-mobile`) |

## Web + desktop: `apps/web/src/`

### Top-level layout

```
apps/web/src/
├── assets/               # Images, logos, SVG icons
├── common/               # DB bridge, event bus, protocols, shared helpers
├── components/           # ~50 UI building blocks
├── dialogs/              # Modal + drawer content (settings, command palette, buy, MFA)
├── hooks/                # ~20 custom hooks (auth, navigation, db, window)
├── interfaces/           # IStorage / IKeyStore implementations
├── navigation/           # Hash router
├── stores/               # 15 Zustand stores
├── utils/                # Platform detection, config, logger
├── views/                # Top-level pages (Auth, Plans, Payments, Wrapped)
├── app.tsx               # Main layout (split panes)
├── bootstrap.tsx         # Route resolution + prerequisite checks
├── root.tsx              # Error boundary + app lock + theme provider
├── index.ts              # Entry: theme + i18n + service worker + mount root
└── global.d.ts           # IS_DESKTOP_APP and friends
```

### Entry sequence

1. `index.ts` reads saved theme from `localStorage`, sets the initial CSS variables, loads the i18n catalogue, registers the PWA service worker, then dynamically imports `root.tsx`.
2. `root.tsx` initialises the key store (`useKeyStore`), calls `loadDatabase()`, displays a loader during decryption, and wraps the tree in `ErrorBoundary + BaseThemeProvider + AppLock`.
3. `bootstrap.tsx` runs prerequisite checks (WebAssembly, IndexedDB, Web Locks, SubtleCrypto) and resolves which route to render (signup, login, account recovery, the main app, plans, …).
4. `app.tsx` mounts the actual UI: a 3-to-4-pane split (`navigation | list | editor | right sidebar`) on desktop, and a three-pane horizontal slider on mobile web.

### State management

Stores live in `apps/web/src/stores/`. Each store is a Zustand `create()` wrapped by `createStore()` from `apps/web/src/common/store.ts`, which adds a shared base pattern (reset, persistence helpers, logging). Highlights:

| Store | Responsibility |
| ----- | -------------- |
| `app-store` | UI-level flags: focus mode, pane visibility, sync status, session state |
| `editor-store` | Active note, save state, session history, editing context |
| `setting-store` | User preferences, hosts, desktop integration config, backup frequency |
| `note-store`, `notebook-store`, `tag-store`, `trash-store`, `attachment-store`, `monograph-store`, `reminder-store` | Entity caches + view models for each list |
| `user-store` | Auth state, subscription, profile |
| `theme-store` | Dark/light + theme metadata |
| `search-store` | Current query, filters |
| `selection-store` | Multi-select state for list operations |

Stores do not talk to Kysely directly — they go through `@notesnook/core` via `apps/web/src/common/db.ts`.

### Routing

Routing is hash-based so deep links survive custom protocols and Electron's file URLs. Three moving parts:

- `navigation/routes.tsx` — named routes (notebooks, tags, colors, shared notes, trash, monographs).
- `navigation/hash-routes.tsx` — editor routes (`#/notes/:id/edit`, `#/notebooks/:id`).
- `navigation/index.ts` — imperative helpers: `hashNavigate()`, `navigate()`, `useQueryParams()`.

The list pane is driven by a `CachedRouter` that keeps previously rendered views alive; the editor pane is driven by a `HashRouter`. An `AppEventManager` emits navigation events so non-router code can react.

### Component organisation

`apps/web/src/components/` groups by feature, not by shape. Notable entries:

- `editor/` — wraps `@notesnook/editor`, exposes toolbar + content surface.
- `list-container/`, `list-item/` — virtualised note/notebook list.
- `navigation-menu/` — left sidebar (favourites, notebooks, tags, shortcuts, monographs, trash, settings).
- `right-sidebar/` — **fork addition**: tabbed panel with a Calendar and an AI Assistant. Hidden on mobile and in focus mode.
- `split-pane/` — resizable multi-pane wrapper.
- `cached-router/`, `hash-router/` — per-pane route renderers.
- `dialog/`, `dialogs/` — base modal + drawer + feature-specific dialog content (command palette, settings, buy, MFA, publish, confirm).
- `theme-provider/` — scoped Emotion theme.
- `title-bar/` — custom title bar for Electron (traffic lights, drag region).
- `virtualized-list/`, `virtualized-grid/` — window-buffered rendering.
- `global-menu-wrapper/` — context menu orchestration.
- `properties/`, `publish-view/`, `pdf-preview/`, `attachment/`, `reminder/` — per-feature panels.

### Dialogs & command palette

Dialogs are singleton modals managed by `apps/web/src/dialogs/`:

- `command-palette/` — `⌘K` / `Ctrl+K` palette for items and actions.
- `settings/` — user preferences.
- `mfa/` — TOTP / recovery code / email prompts.
- `buy-dialog/` — subscription checkout.
- `confirm/`, `error/` — generic prompts.

They share a single dialog-manager store so only one is visible at a time, with history for stackable flows.

### Key hooks

`apps/web/src/hooks/`:

- `use-database.ts` — lazy-load the core database.
- `use-hash-routes.tsx`, `use-hash-location.ts`, `use-navigate.ts` — hash router primitives.
- `use-mobile.ts`, `use-tablet.ts` — responsive breakpoints.
- `use-keyboard-list-navigation.ts` — arrow-key traversal in lists.
- `use-menu.ts` — context-menu positioning.
- `use-search.ts` — runs through `@notesnook/core` lookup.
- `use-spell-checker.ts`, `use-auto-updater.ts`, `use-window-focus.ts`, `use-window-controls.ts` — desktop-only bridges that no-op on web.

### Theming

`@notesnook/theme` defines a `ThemeDefinition` — a tree of scopes (`base`, `list`, `editor`, `dialog`, `navigationMenu`, …) each with variants (`primary`, `secondary`, `disabled`, `selected`, `error`, `success`) and colors (`accent`, `background`, `paragraph`, `border`, etc.). The theme engine:

1. Validates the definition.
2. Fills missing variants/colors from `base`.
3. Emits CSS variables through Emotion's `ThemeProvider`.
4. Stores active theme in `theme-store`.

Dark/light switching simply swaps the definition; nothing reloads.

### Build

See [build_and_tooling.md](./build_and_tooling.md) for the full Vite configuration. Highlights:

- React compiled with SWC (`@vitejs/plugin-react-swc`).
- SVGs imported as React components (`vite-plugin-svgr`).
- PWA (manifest + service worker) via `vite-plugin-pwa`.
- `sqlite` and `desktop-bridge` are Vite aliases that resolve differently for web vs desktop — this is how the same renderer swaps its SQLite driver and gains Electron IPC in the desktop build.
- Language chunks are split separately (`code-lang-*.js`) and prefetched.

## Mobile: `apps/mobile/`

### Layout

```
apps/mobile/
├── android/              # Gradle, Kotlin native modules
├── ios/                  # Xcode, Swift native modules
├── app/
│   ├── app.tsx           # Root: providers, navigation container
│   ├── components/       # Reusable RN components (header, sheets, lists)
│   ├── screens/          # Page components (Notes, Editor, Settings, …)
│   ├── services/         # Sync, notifications, biometrics, settings
│   ├── navigation/       # React Navigation setup + fluid panels
│   ├── stores/           # Zustand stores
│   ├── common/           # Database, filesystem, logger
│   └── ...
```

### Entry

`app/app.tsx` wraps the tree in:

- `SafeAreaProvider`
- `GestureHandlerRootView`
- `ScopedThemeProvider` from `@notesnook/theme`
- `I18nProvider` from `@lingui/react`
- Exception handler, dialog provider, toast provider

The navigation root is `RootNavigation` (`app/navigation/navigation-stack.tsx`) using `createNativeStackNavigator()`. It declares every screen: Notes, Notebook, Search, Favorites, Trash, Reminders, Tags, Colors, Monographs, Editor, Settings, Auth.

Deep linking is configured for `nn://` (internal) and `https://app.notesnook.com/open_notebook?...` (external).

### State

Stores in `app/stores/` mirror the web shape but are mobile-flavoured. See `use-user-store.ts`, `use-editor-store.ts`, `use-setting-store.ts`, `use-message-store.ts`, `use-navigation-store.ts`, `use-theme-store.ts`, `use-attachment-store.ts`, `use-notes-store.ts`, `use-notebook-store.ts`, etc.

### Tablet / phone layouts

`app/navigation/fluid-panels-view.tsx` adapts the layout based on a `deviceMode` flag (`mobile`, `smallTablet`, `tablet`) derived from window size. On tablets a sidebar-plus-content layout is animated in/out; on phones the sidebar slides over content. `react-native-orientation-locker` locks orientation where necessary.

### Editor embedding

See [editor.md](./editor.md). The mobile app hosts `@notesnook/editor-mobile`'s compiled HTML bundle in a `react-native-webview` instance and brokers messages between RN and the editor via JSON over `postMessage`.

### Native modules

`apps/mobile/android/app/src/main/java/com/streetwriters/notesnook/`:

- `MainApplication.kt` — RN bootstrap, registers `NNativeModulePackage`.
- `RCTNNativeModule.java` — exposes `SharedPreferences` KV, `setBackgroundColor()`, `setSecureMode()` (toggles `FLAG_SECURE` for screenshot prevention), widget IDs, activity metadata.
- Biometrics, notifications, filesystem bridges, and the SQLite driver all live as peer modules.

iOS mirrors this with Swift modules (not fully enumerated here — see the Xcode workspace in `ios/`).

### Notifications

`app/services/notifications.ts` uses `@notifee/react-native` to translate reminders into platform notifications. It computes recurrence (daily, weekly, monthly, custom), maintains snooze state, and renders note previews by converting content HTML to plain text. Android additionally has a `ReminderWidgetProvider`.

## The right sidebar (fork-specific)

`apps/web/src/components/right-sidebar/index.tsx` adds a second collapsible sidebar to the desktop/web split view. It renders two tabs:

- **Calendar** — date picker for daily-note navigation and upcoming reminders.
- **AI Assistant** — placeholder for an LLM-backed side panel.

Visibility is controlled by `isRightSidebarVisible` on `app-store`. It is auto-hidden on mobile widths and when focus mode is on.

## Accessibility & keyboard

- All lists support arrow-key navigation via `use-keyboard-list-navigation.ts`.
- The command palette exposes every action a user can take, keyed by description.
- Context menus are keyboard-navigable and announce via `aria-*` attributes.
- Desktop/Electron registers global shortcuts (new note, toggle focus mode, cycle panes). See `apps/desktop/src/utils/menu.ts`.
- Mobile screens use `accessibilityLabel` liberally; reminders can announce via VoiceOver/TalkBack.

## Where to extend UI

- **New feature list/pane** — add a component in `apps/web/src/components/`, wire a route in `navigation/routes.tsx`, add a Zustand store in `apps/web/src/stores/` if you need cross-component state.
- **New dialog** — add under `apps/web/src/dialogs/`, wire through the dialog-manager store. Reuse the base `Dialog` in `components/dialog/`.
- **New mobile screen** — add a component in `apps/mobile/app/screens/`, register it in `navigation-stack.tsx`.
- **Editor feature** — this usually belongs in `packages/editor/src/extensions/`. Keep UI surfaces thin so the same extension works on web/desktop/mobile.
