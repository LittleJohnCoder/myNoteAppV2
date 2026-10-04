# SPEC — Obsidian-like Note-Taking App (Electrobun v1)

Status: draft — §15.14–20 verified against the installed `electrobun@1.18.1` (Phase 1);
the rest is still documentation-derived.
Target framework: **Electrobun v1** (pinned `1.18.1`)
Supersedes: `../myNotesApp/SPEC.md`
Scope: product behaviour **plus** the exact Electrobun v1 integration contract
(naming, files, config, RPC, build/run). Every framework-specific claim below is
taken from the v1.18.1 docs and the v1.18.1 templates (see Sources).

> This spec is written **against v1 on purpose**. If you later move to v2, the
> delta is small and enumerated in §15 — do read it before porting.

---

## 1. Overview

A desktop note-taking app in the Obsidian mould: a folder tree, a notes list, and
a single-pane editor that live-renders Markdown. The editor is **hybrid**: the
line the caret sits on is shown as raw Markdown, every other line is rendered
(KaTeX, Mermaid, task-list checkboxes). Notes are plain `.md` files on disk, one
file per note, in a user-visible notebook directory.

Three processes/parts, exactly as Electrobun v1 models them:

```
┌───────────────────────────────────────────┐
│ Main process — Bun runtime                 │
│   src/bun/index.ts                         │
│   • owns the notebook dir on disk          │
│   • reads/writes .md files                 │
│   • defines the RPC handlers               │
└───────────────┬───────────────────────────┘
                │  typed RPC (views:// bridge)
┌───────────────┴───────────────────────────┐
│ Webview — native OS webview (CEF/WebKit)   │
│   src/mainview/index.html  + React via Vite│
│   • CodeMirror + hybrid markdown plugin    │
│   • folder tree, notes list, toolbar       │
│   • defines the Electroview RPC half       │
└───────────────────────────────────────────┘
```

There is **no Electron** here. The window is a native webview hosted by
Electrobun; the renderer HTML is served over the custom `views://` protocol, not
`file://` and not `http://` in production.[4][9]

---

## 2. Framework target and versions

| Item | Value |
|---|---|
| Electrobun | v1 — pin `1.18.1` (last stable v1 tag[12]; npm `latest` now points at 2.x, so **never** install unpinned) |
| Main-process runtime | Bun (v1's default; there is no Cottontail in v1)[3] |
| Renderer | React 18 + TypeScript, bundled by Vite 6 |
| CLI | `electrobun` (`init` / `dev` / `build` / `run`)[2] |
| Editor | `codemirror-markdown-hybrid` |
| Math / diagrams | KaTeX, Mermaid (pulled in by the hybrid package) |
| v1.18.1 ships | Bun 1.3.0, CEF 125.0.22 (optionally bundled); macOS required to build[18] |

Package pinning note: the repo templates declare `"electrobun": "file:../../package"`
because they live inside the Electrobun monorepo.[14] A standalone app must use a
registry version instead:

```jsonc
// package.json
"dependencies": { "electrobun": "1.18.1" }
```

---

## 3. Project structure (v1 layout)

```
myNoteAppV2/
├── electrobun.config.ts        # REQUIRED — entrypoints, views, copy, per-OS bundleCEF
├── package.json                # scripts + deps (electrobun, react, codemirror-markdown-hybrid)
├── tsconfig.json
├── vite.config.ts              # builds the React renderer into dist/
├── src/
│   ├── bun/
│   │   └── index.ts            # main process (Bun runtime) — RPC handlers + window
│   ├── shared/
│   │   └── types.ts            # RPC schema + DTOs, imported by BOTH halves
│   └── mainview/               # renderer root (Vite `root`)
│       ├── index.html
│       ├── main.tsx            # React entry (createRoot)
│       ├── rpc.ts              # Electroview.defineRPC + exported client
│       ├── App.tsx
│       ├── components/         # Sidebar, FolderTree, NoteList, Toolbar, StatusBar
│       ├── hooks/              # controllers: use<X>Controller()
│       ├── editor/             # CodeMirror + hybrid plugin wiring
│       └── styles.css          # plain CSS (no Tailwind)
└── dist/                       # Vite output — generated; Electrobun copies it into views/
```

**Files that must NOT exist** (they are the signature of the wrong mental model):
`bun.ts` and `bun.html` at the project root. Neither exists in any Electrobun
version — the main entry is `src/bun/index.ts`, and the webview HTML is
`src/mainview/index.html`.[1][12]

---

## 4. Build & dev workflow

### 4.1 `electrobun.config.ts`

Config is mandatory in v1: it is where entrypoints, view assets and the copy map
are declared. Without it the build has nothing to bundle.[3][12]

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Notes",
    identifier: "com.example.notes",
    version: "0.1.0",
  },
  runtime: { exitOnLastWindowClosed: true },
  build: {
    // If you keep the main entry at the default path you can omit build.bun;
    // declare it explicitly when you relocate it.
    bun: { entrypoint: "src/bun/index.ts" },
    // React is compiled by Vite; Electrobun copies the Vite output into views/.
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    // Vite owns renderer rebuilds — keep its output out of Electrobun's watcher.
    watchIgnore: ["dist/**"],
    mac:   { bundleCEF: false },
    linux: { bundleCEF: false },
    win:   { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
```

`build.bun` and `build.views` accept the full Bun.build option set (plugins,
external, minify, splitting, define, jsx, …); Electrobun controls the entrypoints,
outdir and target itself.[3]

Two valid renderer strategies, pick one:

- **Plain TS renderer** (notes-app template): declare `build.views.mainview.entrypoint`
  and `copy` the `index.html` + `index.css`. No bundler.[12]
- **React renderer** (this app): let **Vite** build `src/mainview` → `dist/`, and
  copy `dist/*` into `views/mainview/`. Do **not** also declare `build.views` —
  that would bundle the same source twice.[13]

### 4.2 `vite.config.ts`

Vite owns the React build; Electrobun only copies its output (§8).[16]

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/mainview",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
```

### 4.3 `package.json` scripts

```jsonc
"scripts": {
  "start":        "vite build && electrobun dev",
  "dev":          "electrobun dev --watch",
  "dev:hmr":      "concurrently \"bun run hmr\" \"bun run start\"",
  "hmr":          "vite --port 5173",
  "build:canary": "vite build && electrobun build --env=canary",
  "build:stable": "vite build && electrobun build --env=stable"
}
```

### 4.4 CLI

| Command | Purpose[2] |
|---|---|
| `bunx electrobun init` | scaffold a project from a template |
| `bun install && bun start` | build the renderer + `electrobun dev` (terminal logs, unsigned) |
| `electrobun dev --watch` | rebuild on entrypoint/view/copy changes |
| `electrobun build --env=dev\|canary\|stable` | produce distributables |
| `electrobun run` | run a built app |

Watch mode watches `build.bun.entrypoint`'s directory, each view entrypoint's
directory, `build.copy` inputs and `build.watch`; `build.watchIgnore` excludes
paths (use it for `dist/**`).[2][3]

Caveat: `electrobun init`'s interactive template list is a curated subset
(hello-world, photo-booth, interactive-playground, multitab-browser)[2] — the
`notes-app` template exists in the repo[12] but may not be offered by the
picker. Scaffold with a basic template and lay out §3 yourself.

---

## 5. Main process — `src/bun/index.ts`

```ts
import {
  BrowserWindow, BrowserView, ApplicationMenu, Utils, type RPCSchema,
} from "electrobun/bun";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { NotesRPC } from "../shared/types";
import { listAllNotes, readFolderTree, readNote, writeNote,
         createNote, deleteNote, createFolder, deleteFolder, moveNote } from "./notes";

// Writable app data lives under Utils.paths.userData — NOT next to the bundle.
export const NOTEBOOK_DIR = join(Utils.paths.userData, "notebook");
await mkdir(NOTEBOOK_DIR, { recursive: true });

const notesRPC = BrowserView.defineRPC<NotesRPC>({
  maxRequestTime: 10_000,
  handlers: {
    requests: {
      getAllNotes:   async () => listAllNotes(NOTEBOOK_DIR),
      getFolders:    async () => readFolderTree(NOTEBOOK_DIR),
      openNote:      async ({ id }) => readNote(NOTEBOOK_DIR, id),
      saveNote:      async ({ id, content }) => writeNote(NOTEBOOK_DIR, id, content),
      createNote:    async ({ folder, title }) => createNote(NOTEBOOK_DIR, folder, title),
      deleteNote:    async ({ id }) => deleteNote(NOTEBOOK_DIR, id),
      createFolder:  async ({ parent, name }) => createFolder(NOTEBOOK_DIR, parent, name),
      deleteFolder:  async ({ path }) => deleteFolder(NOTEBOOK_DIR, path),
      moveNote:      async ({ id, targetFolder }) => moveNote(NOTEBOOK_DIR, id, targetFolder),
    },
    messages: {},
  },
});

// Clipboard / undo / select-all must be wired via the application menu, or the
// webview gets no edit accelerators. Keep the roles even in a toolbar-only UI.
ApplicationMenu.setApplicationMenu([
  { label: "Notes", submenu: [{ role: "quit" }] },
  { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { role: "cut" },
      { role: "copy" }, { role: "paste" }, { role: "selectAll" },
  ] },
]);

const win = new BrowserWindow({
  title: "Notes",
  url: "views://mainview/index.html",   // custom protocol, not file://
  rpc: notesRPC,                         // attach the RPC half to the window
  frame: { width: 1100, height: 750, x: 120, y: 80 },
});
```

`BrowserWindow` accepts `title`, `url`, `frame {width,height,x,y}`, `titleBarStyle`
(`default` | `hidden` | `hiddenInset`), `transparent`, `sandbox` and more.[4]
Pass the RPC object through the window's `rpc` option so the webview half is
connected.[4][11]

---

## 6. Renderer — React + Electroview

The renderer is an ordinary web app served from `views/` — build it like any web UI.[10]

`src/mainview/rpc.ts`:

```ts
import { Electroview } from "electrobun/view";
import type { NotesRPC } from "../shared/types";

const rpc = Electroview.defineRPC<NotesRPC>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {},                                  // bun may call into the view too
    messages: { logToWebview: ({ level, msg }) => console[level](msg) },
  },
});

export const electroview = new Electroview({ rpc });
export const notes = electroview.rpc.request;       // notes.getAllNotes({}) → Promise
```

The renderer half is `Electroview.defineRPC` from `electrobun/view`, and the
instance is created with `new Electroview({ rpc })`.[6] Controllers call the bun
side as `electroview.rpc.request.<name>({ ...params })`; messages (fire-and-forget)
go through `electroview.rpc.send.<name>({ ... })`.

`src/mainview/main.tsx` stays the plain React entry[13]:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

Hooks/controllers wrap the client (`use<X>Controller()` per house style), e.g.
`const { notes: all, refresh } = useNotesController();`.

---

## 7. RPC contract

`src/shared/types.ts` — one file, imported by **both** halves. `RPCSchema` is a
type exported from `electrobun/bun`; it is a type-only import and erases at
compile time.[5][11]

```ts
import type { RPCSchema } from "electrobun/bun";

export type NoteMeta = {
  id: string;          // path-relative id, e.g. "work/ideas.md"
  title: string;
  folder: string;      // relative folder path, "" for root
  updatedAt: number;   // epoch ms
  preview: string;     // first ~60 chars of body
  content?: string;    // only populated by openNote
};

export type FolderNode = { path: string; name: string; children: FolderNode[] };

export type NotesRPC = {
  bun: RPCSchema<{
    requests: {
      getAllNotes:   { params: {};                              response: NoteMeta[] };
      getFolders:    { params: {};                              response: FolderNode };
      openNote:      { params: { id: string };                  response: NoteMeta | null };
      saveNote:      { params: { id: string; content: string }; response: { ok: boolean; updatedAt: number } };
      createNote:    { params: { folder: string; title: string }; response: NoteMeta };
      deleteNote:    { params: { id: string };                  response: { ok: boolean } };
      createFolder:  { params: { parent: string; name: string }; response: { ok: boolean; path: string } };
      deleteFolder:  { params: { path: string };                response: { ok: boolean; error?: string } };
      moveNote:      { params: { id: string; targetFolder: string }; response: { ok: boolean; newId: string } };
    };
    messages: {
      noteChanged: { id: string; updatedAt: number };  // bun → view push
    };
  }>;
  webview: RPCSchema<{
    requests: {};   // view-side requests, if any
    messages: {
      logToWebview: { level: "info" | "error"; msg: string };  // bun → view
    };
  }>;
};
```

Rules that are easy to get wrong:

- Each request is an **object-parameter** call: one `params` object (use `{}` for
  none) and a typed `response`.[5]
- The schema is **two-sided** (`bun` and `webview`, each with `requests` +
  `messages`). Define both even when one side is empty.[5]
- Handlers are **async**; return values are the `response` type.

Type-safety fallback: the v1 notes-app defines the view-side type without
`RPCSchema` to avoid pulling bun code into the view bundle[12]; the `RPCSchema`
form above is the documented approach and works because it is type-only.[5]

---

## 8. Assets and the `views://` protocol

- Bundled, read-only web assets are addressed as `views://<viewdir>/<file>`,
  e.g. `views://mainview/index.html`.[4][9]
- `build.copy` maps source files/globs into `views/mainview/…` at build
  time.[3][12][13]
- Asset URLs inside `index.html` (`/assets/…` or `assets/…`) resolve under the
  same `views://mainview/` host, which is why the Vite output must be copied
  there (§4.1).[13]
- Read-only bundled paths: `PATHS.VIEWS_FOLDER`, `PATHS.RESOURCES_FOLDER`.
  Writable app data: `Utils.paths.userData`.[7][8]
- **Never write into `views/`.** It is build output. All note writes go to
  `Utils.paths.userData/notebook`.[7][8][11]

---

## 9. Storage and file model

- Location: `<Utils.paths.userData>/notebook/`. Created recursively on boot.[11]
- Format: **`.md`, one file per note** — not a JSON store. The file tree *is* the
  note tree.
- Folders: directories of arbitrary depth under `notebook/`. `id` is the
  notebook-relative path, so moving a note changes its `id` and its folder.
- Writes: save-on-blur plus a 500 ms debounce while typing.
- Reads: `getAllNotes` walks the tree (skipping dotfiles) for meta + preview;
  `openNote` reads the full body on demand.
- I/O: use async Bun/`node:fs` APIs. RPC handlers run on the main-process event
  loop that also drives the window — synchronous I/O on a large vault stalls the
  whole app.

---

## 10. Features (MVP)

### 10.1 Hybrid editor
- Focused line renders raw Markdown; all other lines render.
- Code highlighting via the hybrid package's Prism integration.
- Task list items render as clickable checkboxes; toggling writes back to source.
- Collapsible headings (H1–H3).
- `$$ … $$` → KaTeX. ` ```mermaid ` fences → Mermaid diagrams.
- Formatting is **toolbar-only** — no Markdown shortcuts. (OS edit accelerators
  still work via the ApplicationMenu roles in §5; that is not a formatting
  shortcut and must stay.)
- Toolbar: Bold, Italic, Strikethrough, H1/H2/H3, Bullet list, Numbered list,
  Task list, Quote, Code, Link, Image, Table, Divider, Math, Mermaid.
- Preview-mode toggle (rendered / split).
- Theme: light/dark via the hybrid package's theme option.

### 10.2 Sidebar (~280 px)
- Folder tree (top ~140 px): recursive, expand/collapse.
- Notes list: title, modified date, 60-char preview; active row highlighted.
- Filter/search box; `+` to create a note in the selected folder.
- Context menu on folders: New Subfolder, Rename Folder, Delete Folder (only
  when empty).

### 10.3 Layout & status bar
- Sidebar + editor pane (~1200 px target width).
- Floating toolbar above the editor.
- Status bar: word count, line count, `filename` + folder path.

### 10.4 Multi-folder
- Unlimited nesting; drag a note onto a folder to move it (`moveNote`).
- Global search across all notes when no folder is selected.

---

## 11. Markdown feature matrix

| Feature | In-editor render | Raw on focus | Notes |
|---|---|---|---|
| Bold / italic / strikethrough | yes | yes | toolbar-inserted |
| Headings H1–H3 | yes | yes | collapsible |
| Bullet / numbered lists | yes | yes | |
| Task lists | yes | yes | checkbox toggles write source |
| Blockquote / code / fenced code | yes | yes | Prism highlight |
| Links / images | yes | yes | images render inline |
| Tables | yes | yes | |
| `$$…$$` math | yes | yes | KaTeX |
| Mermaid fences | yes | yes | diagrams |
| Wikilinks / backlinks | — | — | post-MVP |

---

## 12. RPC method reference

See §7 for the typed schema. Semantics:

| Method | Params | Result |
|---|---|---|
| `getAllNotes` | `{}` | `NoteMeta[]` (no body) |
| `getFolders` | `{}` | root `FolderNode` tree |
| `openNote` | `{ id }` | `NoteMeta` incl. `content`, or `null` |
| `saveNote` | `{ id, content }` | `{ ok, updatedAt }` |
| `createNote` | `{ folder, title }` | new `NoteMeta` |
| `deleteNote` | `{ id }` | `{ ok }` |
| `createFolder` | `{ parent, name }` | `{ ok, path }` |
| `deleteFolder` | `{ path }` | `{ ok, error? }` — fails if non-empty |
| `moveNote` | `{ id, targetFolder }` | `{ ok, newId }` |

---

## 13. House style (carried over from `CODE_STYLE.md`)

- Maximally modular; plain CSS; Zustand for state; controllers exposed as
  `use<X>Controller()`.
- Explicitly **not** TanStack Query, Jotai, or Tailwind.
- Precedence: this SPEC → repo conventions → guide → neighbouring code.

---

## 14. Post-MVP

Wikilinks + backlinks, tag system, Markdown keyboard shortcuts, graph view,
export to HTML/PDF.

---

## 15. Electrobun v1 nuances — the things that break if you guess

1. **v1 ≠ v2.** No Cottontail: the main process is Bun, declared as
   `build.bun.entrypoint`.[3] Imports are from `electrobun/bun` and
   `electrobun/view` (v2 renames the main import to `electrobun/main` and the
   CLI to `hutch`, and defaults the runtime to Cottontail). Do not copy v2 docs.
2. **Config is not optional.** No `electrobun.config.ts` → no entrypoints, no
   `views/`, no copy step, nothing for the webview to load.[3][12]
3. **The renderer is a native webview, not Electron.** HTML is served over
   `views://`; CSS/JS/HTML must be copied into `views/mainview/`.[4][9][13]
4. **React needs a bundler.** Electrobun bundles TypeScript for views but will
   not resolve a React/npm component tree — use Vite, build to `dist/`, copy it
   in.[13][14]
5. **RPC is two-sided and object-parametered.** `BrowserView.defineRPC<T>()` on
   the bun side, `Electroview.defineRPC<T>()` on the view side; every request is
   `{ params, response }`; `RPCSchema` is a type-only import from
   `electrobun/bun`.[5][6][11]
6. **Handlers are async — keep them async.** Blocking sync I/O freezes the
   window.[5]
7. **`views://` in production, dev server in dev — decided by probing, not by a flag.**
   The template's `getMainViewUrl()` awaits `Updater.localInfo.channel()`; when it is
   `"dev"` it sends a `HEAD` request to `http://localhost:5173` and uses that URL only if
   the request succeeds, otherwise falling back to `views://mainview/index.html`.[15] The
   probe is the point: a channel-only check would blank the window whenever Vite is not
   running, breaking plain `bun start`. Both branches verified (§4.3 scripts).
8. **Clipboard/undo/edit accelerators come from the ApplicationMenu**, not from
   the webview. Wire the Edit roles even though formatting is toolbar-only.[4]
9. **Paths.** Writable data → `Utils.paths.userData`[8]; read-only bundles →
   `PATHS.VIEWS_FOLDER` / `PATHS.RESOURCES_FOLDER`[7]. Never write to `views/`.
10. **Packaging.** `electrobun build --env=canary|stable`; per-OS `bundleCEF`
    controls whether CEF ships with the app.[3][12][13] v1 also exposes
    build-only fields such as `useAsar`, `asarUnpack` and `bunVersion`.[3]
11. **Watch mode's coverage is narrower than "watches view sources" suggests — measured.**
    `electrobun dev --watch` prints the roots it watches at startup: on this config exactly
    two, `dist/` and `src/bun/` — `src/mainview/` is **not** watched. Editing
    `src/bun/index.ts` prints `FILE CHANGED: … / Rebuilding…` and restarts the app; editing a
    renderer source does nothing. With `watchIgnore: ["dist/**"]` a Vite rebuild is ignored
    as well, so watch mode is a main-process tool here: use `dev:hmr` (Vite dev server + HMR,
    §15.7) for renderer work. Remove `dist/**` from `watchIgnore` only if you want
    `vite build --watch` output to drive app rebuilds.[13]
12. **Pin the version.** `latest` on npm is 2.x; the templates' `file:../../package`
    is a monorepo artifact. Use `"electrobun": "1.18.1"`.[14]
13. **No `bun.ts` / `bun.html`.** They never existed. Main is
    `src/bun/index.ts`; webview HTML is `src/mainview/index.html`.[1][12]


### Verified against the installed package (Phase 1)
Checked against `node_modules/electrobun@1.18.1` and a real `bun start` run — not from docs.

14. **The npm package ships source, not a build.** Its exports are raw `.ts`:
    `./bun` → `dist/api/bun/index.ts`, `./view` → `dist/api/browser/index.ts`
    (plus `./carrot`). Bun loads them directly. Present on the bun side:
    `BrowserWindow`, `BrowserView`, `Utils`, `ApplicationMenu`, `PATHS`,
    `BuildConfig`, `defineElectrobunRPC`, and the type-only `RPCSchema` +
    `ElectrobunConfig`; the view side exports `Electroview`. `defineRPC` is a
    **static on both** `BrowserView` and `Electroview`.
15. **`type-check` cannot be a bare `tsc --noEmit`.** Because that source is `.ts`
    rather than `.d.ts`, `skipLibCheck` does not cover it, and
    `dist/api/bun/proc/native.ts` raises 6 assignability errors (Bun FFI pointer
    types) under every `@types/bun` from 1.3.8 → 1.4.2, strict or not. `@types/three`
    is also required — its webGPU layer imports `three`, which ships no types. Use
    `scripts/typecheck.sh`: it fails on any error outside `node_modules/electrobun/`
    and prints the quarantined count, so a real error cannot hide behind it.
16. **The first CLI run downloads the platform runtime.** `bin/electrobun.cjs`
    fetches `electrobun-cli-<os>-<arch>.tar.gz` for the pinned version; the native
    CLI then fetches `electrobun-core-<os>-<arch>.tar.gz` (27.5 MB: `bun`,
    `launcher`, `libNativeWrapper.dylib`, `bsdiff`, `bspatch`, …) into
    `node_modules/electrobun/dist-<os>-<arch>/`. Both need network once.
17. **Where the copy map actually lands.** Views are referenced as
    `views://mainview/…` and served from
    `build/<channel>-<os>-<arch>/<App>.app/Contents/Resources/app/views/mainview/`.
    `dist/index.html` arrives byte-identical; Vite's `/assets/…` refs resolve under
    that same view root, so no `base` rewrite is needed.
18. **Bun-side webview events are the cheap verification channel.**
    `BrowserWindow.webview` → `BrowserView.on("dom-ready" | "did-navigate" |
    "did-navigate-in-page" | "did-commit-navigation" | …)` with payload
    `{ detail: { url } }`. `executeJavascript(js)` is fire-and-forget — no completion
    callback — so the view can only report back through navigation or RPC.
19. **`build.views` is supported but stays undeclared here.** The CLI reads
    `config.build.views` when present (and its own scaffold writes that form); this
    app uses only the `copy` map so Vite remains the single source of the renderer.
20. **Dev bundle facts.** `Resources/app/build.json` reads
    `{"defaultRenderer":"native","availableRenderers":["native"],
    "runtime":{"exitOnLastWindowClosed":true},"bunVersion":"1.3.13"}` — with
    `bundleCEF: false` the renderer is the OS webview (WKWebView), and the packaged
    bun comes from the core tarball, not from the dev machine's bun.

### Porting to v2 later (for planning only)
The documented v1→v2 change is narrow: default main runtime Bun → Cottontail
(v2 allows staying on Bun via `build.mainProcess: "bun"` + `build.bun.entrypoint`),
main import `electrobun/bun` → `electrobun/main`, `build.bun.entrypoint` →
`build.mainProcess` / `build.cottontail.entrypoint`, and CLI `electrobun` →
`hutch`. File layout, `views://`, `build.copy` and the RPC schema are unchanged.[17]

---

## Sources

[1] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/guides/quick-start.mdx
[2] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/cli/cli-args.mdx
[3] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/cli/build-configuration.mdx
[4] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/browser-window.mdx
[5] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/browser-view.mdx
[6] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/browser/electroview-class.mdx
[7] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/paths.mdx
[8] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/utils.mdx
[9] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/apis/bundled-assets.mdx
[10] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/guides/creating-ui.mdx
[11] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/notes-app/src/bun/index.ts
[12] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/notes-app/electrobun.config.ts
[13] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/react-tailwind-vite/electrobun.config.ts
[14] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/react-tailwind-vite/package.json
[15] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/react-tailwind-vite/src/bun/index.ts
[16] https://github.com/blackboardsh/electrobun/blob/v1.18.1/templates/react-tailwind-vite/vite.config.ts
[17] https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/migrating-to-v2.mdx
[18] https://github.com/blackboardsh/electrobun/blob/v1.18.1/docs/src/content/docs/electrobun/guides/compatability.mdx
