# SPEC — Obsidian-like Note-Taking App (Electrobun v1)

Status: draft — §15.14–23 verified against the installed `electrobun@1.18.1`
(§15.14–20 in Phase 1 by reading the package; §15.21–22 by Phase 2's live bridge run;
§15.23 behaviourally — the Phase 2 window's ⌘C/⌘V); the rest is still documentation-derived.
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
│   │   ├── index.ts            # main process (Bun runtime) — RPC handlers + window
│   │   ├── domProbe.ts         # dev-only "read the live DOM" channel (§15.22)
│   │   └── notes/              # filesystem layer — one concern per file (§9.1)
│   │       ├── index.ts        # barrel exporting the functions §5 imports
│   │       ├── paths.ts        # id ↔ path mapping + containment checks
│   │       ├── meta.ts         # pure derivations (title, preview, slug) — shared by walk/read/write
│   │       ├── tree.ts         # walk → FolderNode, and listAllNotes (reads every note's meta)
│   │       ├── read.ts         # readNote — open one note and derive its meta
│   │       └── write.ts        # create/save/delete/move + folder create/delete/rename
│   ├── shared/
│   │   └── types.ts            # RPC schema + DTOs, imported by BOTH halves
│   └── mainview/               # renderer root (Vite `root`)
│       ├── index.html
│       ├── main.tsx            # React entry (createRoot)
│       ├── rpc.ts              # Electroview.defineRPC + exported client
│       ├── App.tsx
│       ├── components/         # shell: FolderTree, NotesPanel, Toolbar, StatusBar, TitleInput (§10.1)
│       ├── hooks/              # controllers: use<X>Controller()
│       ├── services/           # thin wrappers over the RPC client (CODE_STYLE §9.2)
│       ├── store/              # Zustand: selectedFolder, selectedNote, draftNote, theme (§10.5)
│       ├── utils/              # pure helpers (folder-tree flatten, …)
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
  // product minimum
  "start":          "bun run build:renderer && electrobun dev",
  "dev":            "electrobun dev --watch",
  "dev:hmr":        "concurrently \"bun run hmr\" \"bun run start\"",
  "hmr":            "vite --port 5173",
  "build:canary":   "bun run build:renderer && electrobun build --env=canary",
  "build:stable":   "bun run build:renderer && electrobun build --env=stable",
  // ours: renderer alone, the type gate (§15.15) and the unit tests (§9.2)
  "build:renderer": "vite build",
  "type-check":     "bash scripts/typecheck.sh",
  "test":           "bun test"
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

`start` and the two build scripts go through `build:renderer` rather than calling `vite build`
directly, so the renderer can be rebuilt on its own. `test` belongs to the notes layer (Phase 3,
§9.2), and the cases that justify it live beside it.

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
import { listAllNotes, readFolderTree, readNote, writeNote, createNote,
         deleteNote, createFolder, deleteFolder, moveNote, renameFolder } from "./notes";

// Writable app data lives under Utils.paths.userData — NOT next to the bundle.
export const NOTEBOOK_DIR = join(Utils.paths.userData, "notebook");
await mkdir(NOTEBOOK_DIR, { recursive: true });

const notesRPC = BrowserView.defineRPC<NotesRPC>({
  maxRequestTime: 10_000,
  handlers: {
    // Handlers stay one-liners: the notes layer returns the §7 envelopes itself (§9.1), so there
    // is no error plumbing to duplicate here.
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
      renameFolder:  async ({ path, name }) => renameFolder(NOTEBOOK_DIR, path, name),
    },
    messages: {
      // The view's readiness handshake (§7). Every bun → view push is sent from this handler and
      // never straight after the window is created, because sends are not queued. The live half is
      // a one-shot handler: log the handshake, push, and (dev only) read the DOM back.
      viewReady: (payload) => void handleViewReady(payload),
    },
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
connected.[4][11] The same object is reachable as `win.webview.rpc`, which is how the
bun side calls *into* the view: `win.webview.rpc.send.noteChanged({ id, updatedAt })`
for fire-and-forget, `win.webview.rpc.request.<name>({ ...params })` for
request/response. The view is the half that must declare a matching handler (§7).

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
    requests: {},   // nothing extra to serve: the view's built-in evaluateJavascriptWithResponse
                    // (§7) is merged in by defineRPC, and declaring it in the shared schema is
                    // what makes it callable from bun with types (§15.22)
    messages: { logToWebview: ({ level, msg }) => console[level](msg) },
  },
});

export const electroview = new Electroview({ rpc });
export const notes = electroview.rpc.request;       // notes.getAllNotes({}) → Promise
```

Take the client from the **local binding**, as above: `rpc` is optional on the `Electroview` instance
type, so `electroview.rpc.request` needs an assertion while the binding is already non-optional.
`src/mainview/rpc.ts` exports the binding for exactly that reason.

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
  id: string;          // notebook-relative path id incl. ".md", e.g. "work/ideas.md" (§9.1)
  title: string;       // the note's name — its filename stem; first H1 only as the fallback (§9.1)
  folder: string;      // relative folder path, "" for root
  updatedAt: number;   // epoch ms, from the file mtime — also the sort key (§9.1)
  preview: string;     // first 60 chars of body, whitespace runs collapsed (§9.1)
  content?: string;    // only populated by openNote
};

export type FolderNode = { path: string; name: string; children: FolderNode[] };

// Every mutating method answers with one of these envelopes (§9.1). Expected failures are *returned*,
// not thrown, so the renderer can name a reason (Phase 8's toast) without a try/catch per call. These
// are the names `src/shared/types.ts` exports, so the schema and the code agree by name, not just shape.
export type MutationResult = { ok: boolean; error?: string };
export type SaveNoteResult = MutationResult & { updatedAt: number };
export type CreateNoteResult = MutationResult & { note?: NoteMeta };   // the slugged note itself, so
                                                                       // the renderer never has to guess
export type CreateFolderResult = MutationResult & { path: string };
export type MoveNoteResult = MutationResult & { newId: string };
export type RenamedId = { from: string; to: string };                  // every descendant note's id
export type RenameFolderResult = MutationResult & { path: string; changedIds: RenamedId[] };

export type NotesRPC = {
  bun: RPCSchema<{
    requests: {
      getAllNotes:   { params: {};                                  response: NoteMeta[] };
      getFolders:    { params: {};                                  response: FolderNode };
      openNote:      { params: { id: string };                      response: NoteMeta | null };
      saveNote:      { params: { id: string; content: string };     response: SaveNoteResult };
      createNote:    { params: { folder: string; title: string };   response: CreateNoteResult };
      deleteNote:    { params: { id: string };                      response: MutationResult };
      createFolder:  { params: { parent: string; name: string };    response: CreateFolderResult };
      deleteFolder:  { params: { path: string };                    response: MutationResult };
      moveNote:      { params: { id: string; targetFolder: string }; response: MoveNoteResult };
      // Phase 4 addition: §10.2 listed "Rename Folder" from the start, but the original §7 had no
      // method for it. Note ids are paths, so renaming a folder re-ids every note below it — hence
      // the map, and hence `changedIds` is empty (never absent) when the folder holds no notes.
      renameFolder:  { params: { path: string; name: string };      response: RenameFolderResult };
    };
    messages: {
      // Messages the bun side RECEIVES — i.e. sent by the view.
      //
      // Phase 2 addition (this line is not in the original §7 draft, which said "none yet"): the
      // view announces itself once it is mounted and listening, and bun pushes nothing until it
      // hears this. bun → view sends are fire-and-forget with no queue, so a push that races the
      // view's socket is silently dropped (measured, Phase 2 — see lessons.md).
      viewReady: { url: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      // Served by the view itself. Phase 2 addition: `Electroview.defineRPC` merges this built-in
      // in (it runs the script through `new Function` and returns its value), but the built-in is
      // not merged into the bun-side types — declaring it here is what makes it callable from bun
      // with types (§15.22). The app's "read the live DOM from bun" channel: a script body with an
      // explicit `return`, e.g. `return document.querySelector("main.shell")?.textContent ?? ""`.
      evaluateJavascriptWithResponse: { params: { script: string }; response: unknown };
    };
    messages: {
      // Messages the view RECEIVES — i.e. sent by bun. See §5 for the send call.
      logToWebview: { level: "info" | "error"; msg: string };
      // Sent after every successful saveNote/createNote, carrying that note's id and updatedAt (§9.1).
      // The view may ignore the echo of its own write; this exists as the reconciliation signal for a
      // later second window or an external edit. delete/move/rename are deliberately NOT covered — the
      // view initiated those and re-reads the tree itself; a coarse "re-read" push is post-MVP.
      noteChanged: { id: string; updatedAt: number };
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
- A handler object may cover only the methods that exist so far: `handlers.requests` keys are
  optional (`RPCRequestHandlerObject`), so a complete schema plus one implemented method compiles,
  and calling an unimplemented one rejects at runtime with
  `The requested method has no handler: <name>`. Phase 2 ships exactly that shape.
- bun → view sends are **not queued**: a `send` issued before the view's socket is open is dropped
  with no error, which is why the schema above carries the `viewReady` handshake rather than pushing
  straight after `new BrowserWindow(...)`.
- Every **mutation** answers with `{ ok, …payload, error? }` and returns expected failures instead of
  throwing (§9.1). Reads return data and use `null` for absence. If a call rejects, it is a bug or an
  unimplemented method — not a missing file.
- **Ids change.** An id is a path, so `moveNote` and `renameFolder` invalidate it: the caller re-keys
  its state from `newId` / `changedIds` rather than assuming the old id still resolves (§12).
- **`createNote` is called when the title is committed, not when `+` is pressed.** `+` opens an unsaved
  draft (§10.5); the note materialises on the first commit — the title committed with Enter/Tab/blur, or
  the first body save with the title left empty. There is deliberately **no draft method** in this schema:
  a draft has no id, so it is renderer state, and the ten methods above stay ten.

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
  `openNote` reads the full body on demand. Title derivation, preview formatting, filtering and
  ordering are pinned in §9.1.
- I/O: use async Bun/`node:fs` APIs. RPC handlers run on the main-process event
  loop that also drives the window — synchronous I/O on a large vault stalls the
  whole app.

---

### 9.1 Notes-layer semantics (Phase 3 decisions)

Each of these was open in the Phase 3 draft and is now a decision. Implement them as written — the
numbered checks under Phase 3's Verification in `todo.md` cannot be judged without them.

- **`id`.** Notebook-relative, `/`-separated, and **includes the `.md` extension**
  (`"Ideas/2026/plan.md"`). The notebook root is `path: ""` / `folder: ""`.
- **Title.** The note's **name** — its filename stem, exactly as stored, so lowercase and space-free —
  wins. The first ATX H1 (`# …`) in the body is the **auxiliary** fallback, used only when the title was
  skipped at creation; a body with no H1 either ⇒ `untitled`. Nothing in the MVP renames a file (the
  toolbar is formatting-only and there is no rename action), so a note created as `plan.md` is titled
  `plan` whatever its body says, and only an untitled note takes its title from its body. Making the title
  editable later *is* that rename — deferred, §14.
- **"No title given" is decided by the filename**, because that is all the layer can see: a stem matching
  `/^untitled\d*$/` means the title was skipped, which is what sends the note to the H1 fallback. Accepted
  consequence: a note someone deliberately names `untitled` takes the fallback path too.
- **Failure shape.** Mutations return `ok: false` with a short `error` string instead of throwing:
  `not found`, `invalid id`, `invalid name`, `already exists`, `folder not empty`. Reads
  (`getAllNotes`, `getFolders`, `openNote`) return data and use `null` for absence; only genuine bugs
  reject.
- **Path safety.** An `id` must be `/`-separated, non-empty, not absolute, free of any `..` segment, and
  after `resolve()` against `NOTEBOOK_DIR` — symlinks included — still inside it. Anything else →
  `{ ok: false, error: "invalid id" }`. Ids are **rejected, never silently normalised**: a normalised id
  leaves the renderer holding a stale key. `name`s and `parent`/`path` params get the same treatment
  (`invalid name`).
- **Timestamps.** `updatedAt` is the file's mtime in epoch ms, read at list/open time — not a stored
  field. It is both the sort key and the "modified date" in the list, so one source keeps them agreeing.
- **Tree walk.** Notes are `*.md` files (extension compared case-insensitively). Dot-**files** and
  dot-**directories** are skipped at any depth; other extensions are ignored as notes, but their
  directories are still walked so nesting is not lost.
- **Root node.** `getFolders` returns `{ path: "", name: "Notebook", children: […] }` — the root's name is
  fixed, not derived from the userData path.
- **Sort order.** `getAllNotes` → `updatedAt` descending, ties broken by `id` ascending.
  `FolderNode.children` → `name` ascending, locale-aware and case-insensitive. Nothing else states an
  order, and "the list filters to that folder" is only checkable against a fixed one.
- **Atomic writes.** Write to a sibling temp file in the same directory, then `rename()` — so quitting
  during the 500 ms save debounce can never leave a half-written note.
- **When `noteChanged` fires.** After every successful `saveNote`/`createNote`, with that note's id and
  `updatedAt`. Nothing sends it today (Phase 2 declared the message; §7 records the trigger; Phase 3's
  handlers stay one-liners over the notes layer and do not push).
- **One notebook, one tree.** Every note is one `.md` file and every folder is an ordinary nested
  directory — all under `NOTEBOOK_DIR`, and nothing may resolve outside it. There is no second storage
  root, no sidecar index, no JSON. `createFolder` nests through `parent` to arbitrary depth inside that
  same dir.
- **`createNote` target folder.** `folder` must name an existing directory under the notebook (`""` is
  the root). A missing one returns `{ ok: false, error: "not found" }` — `createNote` never creates
  folders; `createFolder` does.
- **`createNote` writes an empty file** (0 bytes). Its `title` is therefore the filename stem and its
  `preview` is `""`; the returned `note` is derived from the written file exactly as `getAllNotes` derives
  it. §10.5's `+` passes the committed title, or `""` when the user skips straight to the body — so the
  empty note is *named* untitled (`untitled.md`, then `untitled1.md`, `untitled2.md`, …) rather than given
  a body, and all of those are titled `untitled` (§9.1's no-title stem).
- **Slug rule (`createNote`).** The slug comes from the `title` **argument** — the body never names or
  renames a file (§10.5's `+` passes the committed title, or `""`). A title is a simple alphanumeric
  string: lowercase, strip a trailing `.md`, then drop every character outside `[a-z0-9]` — **no symbols,
  spaces included**.
  Empty → `untitled`. The `.md` strip runs *before* the drop, so title `notes.md` becomes `notes`, not
  `notesmd`. Collisions append a **plain number**, the lowest free from 1: `untitled.md`, `untitled1.md`,
  `untitled2.md`. The number is added *after* slugging, so it is never slugged away. The response returns
  the resulting `note`, so the renderer never guesses an id.
- **`createFolder` names are verbatim, not slugged.** `name` is validated (non-empty, no `/` or `\`, no
  `.`/`..` segment, no escape from the notebook) and used as-is — a folder name may contain spaces.
  `parent` is validated the same way; a missing `parent` → `not found`; an existing sibling → `already
  exists`.
- **`preview` is the raw first 60.** Collapse every whitespace run (newlines included) to a single space,
  trim, then take 60 chars — the H1 line is part of the body and is **not** stripped, no `…` is appended
  (presentation is the renderer's `truncateSnippet`), and Markdown punctuation stays in place.
  `openNote` is the only call that returns the body at all.
- **The auxiliary `title` match.** For a note whose title was skipped, the first line matching
  `/^#\s+(.+?)\s*#*\s*$/` anywhere in the body, trimmed; no H1 ⇒ `untitled`. No code-fence parsing — a
  `# x` inside a fence can win if it comes first. A heading shown this way is shown **as written**, symbols
  included: it is body text, not a filename, so the alphanumeric rule below does not reach it.
- **Error vocabulary per param.** A note-path param (`id`) that fails §9.1 path safety → `invalid id`; a
  folder-path param (`folder`, `parent`, `path`, `targetFolder`) → `invalid name`.
- **Degenerate targets.** `deleteFolder`/`renameFolder` on the root (`path: ""`) → `invalid name`.
  `renameFolder`/`moveNote` onto an existing sibling → `already exists`. `moveNote` into a missing folder
  → `not found`. `deleteFolder` treats **any** directory entry (dotfiles and non-`.md` included) as
  content → `folder not empty` — so a folder can be blocked by a `.DS_Store` the OS dropped in, or a
  `.tmp-…` left by an interrupted write. That is deliberate: the app never force-deletes a file it did
  not put there; the user clears it by hand. Note ids and folder paths are validated as a *whole* path
  (no empty/`.`/`..` segment), so a name that merely contains a dot (`v1.2`) is fine.
- **`meta.ts` exists so the three derivations have one home.** Title, preview and slug are needed by the
  walk (`tree.ts`), the reader (`read.ts`) and the writer (`write.ts`). Keeping them in `read.ts` (SPEC
  §3's original four-file split) would make the walker and the writer import from the "open a note"
  module for string helpers — backwards, and the first place the rules would get copy-pasted instead of
  shared. `meta.ts` is I/O-free and is the pure-test target (SPEC §9.2).
- **Moving a note into its own folder** is a no-op the renderer short-circuits (§10.5); called anyway, the
  layer returns `{ ok: true, newId: id }` and touches no disk.
- **Temp file for the atomic write.** `.{name}.tmp-{pid}-{rand}` in the same directory, dot-prefixed
  **on purpose** so the §9.1 dotfile skip can never surface a half-written note in a walk.
- **Containment check.** Lexical: `resolve()` the target and require it inside `NOTEBOOK_DIR`;
  symlink-safe: `realpath()` the nearest existing ancestor and require the same — a leaf that does not
  exist yet cannot be realpath'd, so its ancestor is what we resolve. This applies to folder paths as much
  as note ids.

### 9.2 Notes-layer tests (Phase 3)

- Runner: `bun test` — no dependency, no config file. It is in §4.3's script list (`test`); the
  phase's first commit must leave that script with real cases behind it.
- Tests sit next to their subject: `src/bun/notes/paths.test.ts`, `src/bun/notes/meta.test.ts`,
  `src/bun/notes/tree.test.ts`, `src/bun/notes/write.test.ts`.
- The highest-value targets are the pure helpers — id ↔ path mapping (every rejection in §9.1), the
  derivation rules (`title` in **both** branches: the name wins, and an `untitled`/`untitledN` stem falls
  back to the H1, else `untitled` — plus `preview` and `slug`) and the tree walk (dotfiles,
  dot-directories, non-`.md` files, nesting). `write.test.ts` drives the mutations against the same temp
  directory (create/collision/atomic write/delete/move/rename). No DOM, no RPC; a temp directory is the
  only fixture.

---

## 10. Features (MVP)

### 10.1 Hybrid editor
- **Title input — the note's name.** A single-line input above the body; it is not part of the body text
  and not Markdown. On a new note it holds focus, with `Untitled` as a *placeholder*, not content; Enter,
  Tab and blur commit it, and Tab continues into the body. Input is constrained to the slug charset —
  letters and digits, lowercased as it is typed — so the field always shows exactly what will be stored.
  In the MVP it is creation-only: once the note exists the title is read-only, because editing it
  afterwards is a rename (§14).
- **The title is not in the body.** Nothing writes an H1 for you; the body contains exactly what the user
  typed into the editor.
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
- Filter/search box; `+` to create a note in the selected folder (it starts an unsaved draft, §10.5).
- Context menu on folders: New Subfolder, Rename Folder, Delete Folder (only
  when empty). Counts, search scope, drag-and-drop and the theme have their
  semantics pinned in §10.5.

### 10.3 Layout & status bar
- Sidebar + editor pane (~1200 px target width).
- Floating toolbar above the editor.
- Status bar: word count, line count, `filename` + folder path.

### 10.4 Multi-folder
- Unlimited nesting; drag a note onto a folder to move it (`moveNote`).
- Global search across all notes when no folder is selected.

---

### 10.5 Sidebar & shell semantics (Phase 4 decisions)

- **Component names.** `FolderTree`, `NotesPanel` (the earlier drafts also said "NoteList" — one name
  only), `TitleInput`, `Toolbar`, `StatusBar`. `TitleInput` is the editor pane's name field (§10.1), not
  a sidebar component; the rest sit in a sidebar shell under `components/`.
- **Store.** `store/selectedFolder.ts` (`string | null`, `null` = "All Notes"),
  `store/selectedNote.ts` (`string | null` — the active row, and what Phase 5 opens),
  `store/draftNote.ts` (`{ folder: string } | null` — a new note with no file yet, §10.5's `+`),
  `store/theme.ts` (`"light" | "dark"`). One Zustand file each; components reach them through
  controllers, never directly. `selectedNote` stays a plain id because a draft has no id — hence its own
  store rather than a tagged union in the selection.
- **Theme.** `theme.ts` is the single source of truth: it writes `data-theme` on `<html>` from one
  effect and nothing else touches that attribute. Initial value: the stored preference, else
  `prefers-color-scheme`. Tokens are declared once on `:root`, with dark overrides under
  `[data-theme="dark"]` (CODE_STYLE §11.2/§11.3) — CODE_STYLE is gitignored, so a reader without it takes
  the token names from `src/mainview/styles.css`.
- **Folder counts.** Recursive: a folder's count is every note in its subtree, so the root's count equals
  `getAllNotes().length`. Counts are computed in the renderer from `getAllNotes` — `FolderNode` carries
  no count field, and adding one would mean another method.
- **Search.** Case-insensitive substring over `title` + `preview`. Scope: the selected folder's subtree,
  or every note when `selectedFolder` is `null`. ~150 ms debounce; the query survives a folder switch;
  clearing it restores the unfiltered list.
- **Expand/collapse.** Component-local state keyed by folder path, not persisted. Selecting a folder
  expands its ancestors; the root starts expanded; nothing auto-collapses.
- **Drag & drop.** Native HTML5 DnD: note rows draggable, folder rows drop targets, and the tree root /
  "All Notes" row meaning "move to the notebook root". Dropping a note on the folder it already lives in
  is a no-op. On success the list is re-keyed from `moveNote`'s `newId` and the row stays selected; on
  failure the row returns to its original folder and the reason is surfaced (Phase 8's toast).
- **`+` button starts a draft; it writes nothing.** It sets `draftNote = { folder: selectedFolder ?? "" }`
  and the editor opens with the title input focused. Committing a non-empty title calls
  `createNote({ folder, title })` **once**, then clears the draft and selects the returned `note.id`;
  skipping the title and typing into the body instead calls `createNote({ folder, title: "" })` on the
  first body save. Either way the file is written once, already correctly named — there is no rename, and
  walking away from a draft leaves nothing on disk. Collision naming is the notes layer's business (§9.1 —
  `untitled`, `untitled1`, …), so the renderer never guesses an id.
- **A colliding title is visible.** Committing `plan` when `plan.md` already exists produces `plan1.md`,
  and the list shows `plan1` — the name the user typed is not the name they get. That is the direct cost of
  "the name is the title" plus the collision rule, and it is why the renderer selects the returned `note`
  rather than the name it sent.
- **Drafts are invisible to the sidebar.** The notes list shows notes; a draft is not one until it
  materialises.
- **Toolbar and status bar in Phase 4 are placeholders.** The toolbar renders its action buttons
  disabled with a tooltip; the status bar renders `—` per field. Phase 4's acceptance is the shell and
  the sidebar; those two components get their behaviour in Phases 5–7.

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

See §7 for the typed schema. Reads return data (`null` for an absent note); **every mutation returns
`{ ok: boolean; error?: string }` plus its payload**, and expected failures are returned rather than
thrown (§9.1 lists the error strings). The result names below are §7's — `src/shared/types.ts`
exports the same names, so the table, the schema and the code agree by name, not just shape.

| Method | Params | Result |
|---|---|---|
| `getAllNotes` | `{}` | `NoteMeta[]`, no bodies, `updatedAt` desc (§9.1) |
| `getFolders` | `{}` | root `FolderNode` tree (`path: ""`, `name: "Notebook"`) |
| `openNote` | `{ id }` | `NoteMeta` incl. `content`, or `null` |
| `saveNote` | `{ id, content }` | `SaveNoteResult` — `{ ok, updatedAt, error? }` |
| `createNote` | `{ folder, title }` | `CreateNoteResult` — `{ ok, note?, error? }`, `note` is the new `NoteMeta` |
| `deleteNote` | `{ id }` | `MutationResult` — `{ ok, error? }` |
| `createFolder` | `{ parent, name }` | `CreateFolderResult` — `{ ok, path, error? }` |
| `deleteFolder` | `{ path }` | `MutationResult` — `{ ok, error? }`, `folder not empty` when it has contents |
| `moveNote` | `{ id, targetFolder }` | `MoveNoteResult` — `{ ok, newId, error? }`, `newId` is the id after the move |
| `renameFolder` | `{ path, name }` | `RenameFolderResult` — `{ ok, path, changedIds, error? }` |

`renameFolder` is the Phase 4 addition, and the reason Phase 3 is "ten methods", not nine. `os.rename`
semantics: the directory and its contents move together, and because ids *are* paths, **every descendant
note's id changes** — hence `changedIds: { from, to }[]`, the folder-level counterpart of `moveNote`'s
`newId`. The renderer re-keys the note list and the selection from that map. It is `[]` only when no note
sits below the renamed folder. Renaming onto an existing sibling fails with `already exists`; a
case-only rename is legal on a case-insensitive filesystem (APFS), not a collision.

---

## 13. House style (carried over from `CODE_STYLE.md`)

- Maximally modular; plain CSS; Zustand for state; controllers exposed as
  `use<X>Controller()`.
- Explicitly **not** TanStack Query, Jotai, or Tailwind.
- Precedence: this SPEC → repo conventions → guide → neighbouring code.

---

## 14. Post-MVP

**Editable title — do this first.** The MVP's title input is creation-only (§10.1). Making it editable
afterwards *is* a rename: the title is the filename, so changing it renames the file and changes the note's
id, and the selection, the notes list and any open editor must all follow the new id. That is the whole
reason it is deferred.

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
   the webview. Wire the Edit roles even though formatting is toolbar-only — verified in
   Phase 2: with role-only entries (no labels, no explicit accelerators) ⌘C and repeated ⌘V
   do reach the webview, and a webview without those roles gets no edit accelerators at
   all.[4]
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

21. **A schema half names the side that handles it — `messages` included.** `Schema["bun"]["messages"]`
    is what bun *receives*; a bun → view push must be declared in the **`webview`** half. Verified from
    `ElectrobunRPCConfig`/`defineElectrobunRPC`, where `handlers.requests` and `handlers.messages` are both
    typed from `Schema[Side]`. A mis-send is caught (the send proxy is typed from the other half), but a
    handler for a message nobody sends is silently dead.[5]
22. **The view has built-in requests bun can call.** `Electroview.defineRPC` merges extra handlers, among
    them `evaluateJavascriptWithResponse: { params: { script: string }; response: any }` — the package's
    own `any`. The app declares the same params with `response: unknown` (§7's schema) and narrows at the
    single call site (`src/bun/domProbe.ts`), so a script's value is never trusted by accident. It runs the
    script in the view and returns its value. Bun reaches it via `win.webview.rpc.request.
    evaluateJavascriptWithResponse({ script })` — only if the schema declares it, since the built-in is not
    merged into the bun-side types. Plain `executeJavascript(js)` stays fire-and-forget.[6][11]
23. **Menu `role` strings are unvalidated, though labels are not required.** `ApplicationMenuItemConfig.role`
    is typed `string` rather than a union, so a wrong role type-checks fine and is forwarded to the native
    side, where an unknown selector lands as a **label-less item** rather than an error. Omitting `label` is
    correct: `core/menuRoles.ts` ships `roleLabelMap` and `menuConfigWithDefaults` fills the label from it
    (`{ role: "copy" }` → "Copy"). Only a behavioural test proves the roles are wired, and it passed in
    Phase 2 — role-only App/Edit entries installed and ⌘C/⌘V landed in the webview (§4.3 verification).[4]

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
