# Development Roadmap: myNoteAppV2

Electrobun **v1 (pinned 1.18.1)** + React + CodeMirror hybrid editor. Contract: `SPEC.md`.
House style: `CODE_STYLE.md` — carried over from the v1 repo and reconciled with this spec (§17 there).

## How this file is used

- A **phase** is the smallest unit that can be started and finished with one verification. Size it so
  the verification can fail for exactly **one** reason.
- Setup is **one** phase. Each genuinely complex build step gets its own phase; small mechanical steps
  ride along with the phase they serve.
- An agent claims a phase, does the tasks, and must reproduce the **Verification** lines before
  marking it done. "Landed" without a reproduced observation is not done.
- A run that shows no change is **not** evidence your change had no effect. Before concluding
  anything, confirm the app actually launched and is alive, that the built bundle is newer than the
  source you edited (`Resources/app/bun/index.js` vs `src/bun/index.ts`), and that your change is
  present in it (`grep` for it). A launch that died and a stale bundle look exactly like a no-op edit.
- Phases are sequential unless a phase says otherwise. Dependencies are stated explicitly — the v1
  roadmap died mid-file at Phase 7 with 6 phases unchecked, so nothing here is left implied.

Legend: `[ ]` not started · `[~]` in progress · `[x]` verified

## Locked conventions (not a phase — inherited from SPEC, do not re-litigate)

- `electrobun` pinned to `1.18.1`; imports from `electrobun/bun` (main) and `electrobun/view` (webview).
- Layout is SPEC §3: `src/bun/index.ts`, `src/shared/types.ts`, `src/mainview/*` (Vite root), built to
  `dist/` and copied into `views/mainview/`. **No** `bun.ts` / `bun.html` at the root.
- RPC is two-sided and object-parametered; handlers are **async**; `id` **is** the notebook-relative
  path. Storage is `.md` files under `Utils.paths.userData/notebook/` — never JSON, never in `views/`.
- Editing is **toolbar-only** (no markdown keybinds); OS edit accelerators come from `ApplicationMenu`.
- House style: controllers + `use<X>Controller()`, Zustand for shared state, plain CSS + `cx()`,
  `@/*` → `src/mainview/`. No Tailwind, no TanStack Query, no `cn()`.
- `CODE_STYLE.md` is **gitignored by design** — a fresh clone will not have it, and SPEC §13 still
  cites it. It is authoritative on the authoring machine only.

---

## Phase 1 — Scaffold, toolchain, and the `views://` shell

*Deps: none. Retires the "wrong mental model" risk first.*

- [x] `package.json`: `electrobun@1.18.1`, React 18, TypeScript, Vite 6, `@vitejs/plugin-react`; scripts
      per SPEC §4.3 (`start`, `dev`, `dev:hmr`, `hmr`, `build:canary`, `build:stable`), plus
      `build:renderer` (Vite alone) and a `type-check` gate (SPEC §15.15 — a bare `tsc --noEmit` cannot pass).
- [x] `electrobun.config.ts` exactly as SPEC §4.1: `app`, `runtime`, `build.bun.entrypoint`,
      `build.copy` (`dist/index.html` + `dist/assets` → `views/mainview/`), `watchIgnore: ["dist/**"]`,
      per-OS `bundleCEF: false`.
- [x] `vite.config.ts` with `root: "src/mainview"`, `build.outDir: "../../dist"`, `emptyOutDir`.
- [x] `tsconfig.json` + `@/*` path alias → `src/mainview/`.
- [x] Minimal `src/mainview/{index.html,main.tsx,App.tsx,styles.css}` rendering a placeholder shell,
      and `src/bun/index.ts` opening a `BrowserWindow` on `views://mainview/index.html`.
- [x] Do **not** declare `build.views` (Vite owns the renderer build — SPEC §4.1).

**Verification** — complete, reproduced 2026-10-04
- `bun install`: 141 packages, no missing peer/module errors.
- `bun start`: `[bun] window created { id: 1 }` then
  `[bun] webview dom-ready — views://mainview/index.html loaded`; zero errors in the dev log.
- The window's content demonstrably came from `views://` **and** React mounted: a temporary probe had
  the view report its own DOM text back through the URL hash, which bun read as `did-navigate-in-page` →
  `#proof=Notes|myNoteAppV2 · Electrobun v1 shell · phase-1` (the rendered `<h1>` + marker paragraph).
  Probe removed afterwards; only the `dom-ready` log stays.
- Copy chain is wired, not assumed: `Resources/app/views/mainview/index.html` is byte-identical to
  `dist/index.html` (sha256 `3b17bc67…`) and the `/assets/index-*.{js,css}` names referenced by that HTML
  exist in the same bundle view root.
- Renderer edit propagates: setting `SHELL_MARKER` to `phase-1-edited` and re-running
  `bun run build:renderer` yielded a bundle containing the new value with the old one gone; reverting
  restored it exactly (`git diff` clean for `App.tsx`).
- `bun run type-check`: `type-check OK — 0 project errors (6 known electrobun-internal error(s)
  quarantined)`.
- Both view-URL branches reproduced (SPEC §15.7): with no dev server, the app logs
  `view: no Vite dev server — using the built bundle` and dom-ready for `views://mainview/index.html`;
  with `bun run hmr` up, it logs `view: Vite dev server at http://localhost:5173 (HMR)` and dom-ready
  for that URL. Without the probe, `dev:hmr`/`hmr` were inert — the window silently kept loading the
  built bundle.
- Script sweep: `bun install`, `build:renderer`, `start`, `dev`, `hmr`/`dev:hmr` and `type-check` all
  exercised. **Not** exercised: `build:canary` / `build:stable` — those are packaging (and need signing
  identities), so they belong to Phase 8's verification, not this one.
- Watch coverage measured (SPEC §15.11): `dev --watch` reports watching `dist/` + `src/bun/` only;
  editing `src/bun/index.ts` triggers `FILE CHANGED … Rebuilding`, editing a renderer source does nothing,
  and touching `dist/index.html` is suppressed by `watchIgnore: ["dist/**"]`.

## Phase 2 — Two-sided RPC bridge, window wiring, main-process skeleton

*Deps: 1. Retires the riskiest unknown: the bridge itself. No real note I/O yet.*

- [ ] `src/shared/types.ts` with the full `NotesRPC` schema from SPEC §7 (both halves, `RPCSchema`
      type-only import from `electrobun/bun`).
- [ ] `src/bun/index.ts`: `BrowserView.defineRPC<NotesRPC>()`, `await mkdir(NOTEBOOK_DIR, {recursive})`
      under `Utils.paths.userData`, pass the RPC object via the window's `rpc` option.
- [ ] `ApplicationMenu.setApplicationMenu([...])` with the App + Edit roles (undo/redo/cut/copy/
      paste/selectAll) — without these the webview gets **no** edit accelerators.
- [ ] `src/mainview/rpc.ts`: `Electroview.defineRPC<NotesRPC>()`, export the client
      (`electroview.rpc.request`) and the instance.
- [ ] `src/mainview/services/notes.service.ts` with one **stub** method (e.g. `getFolders` returning a
      literal root node) to prove the round trip end to end.
- [ ] Shell renders the stub's response.

**Verification**
- The stub call returns a value across the bridge and it is rendered in the window (RPC request path).
- A fire-and-forget message works both ways (bun → view and view → bun).
- `utils.paths.userData/notebook/` exists on disk after launch; relaunching does not error.
- ⌘C / ⌘V / ⌘Z work inside the window (proves the Edit menu roles are wired).
- `bunx tsc --noEmit` exits 0 — the shared schema compiles from both halves.

## Phase 3 — Notes store on disk (all nine SPEC §7 methods)

*Deps: 2. The bulk backend phase; async I/O only.*

- [ ] `src/bun/notes/` filesystem layer, one concern per file: id ↔ path mapping, tree walk
      (skipping dotfiles), read, write, create, delete, folder create/delete, move.
- [ ] Handlers: `getAllNotes` (meta + ~60-char preview, no bodies), `getFolders` (recursive
      `FolderNode`), `openNote` (body on demand, `null` when absent), `saveNote`, `createNote`,
      `deleteNote`, `createFolder`, `deleteFolder` (fails when non-empty), `moveNote` (returns `newId`).
- [ ] All handlers `async` with `node:fs/promises` — no sync I/O (SPEC §9, §15.6).
- [ ] Path safety: reject/normalise ids that escape `NOTEBOOK_DIR`.

**Verification**
- Creating a note through the bridge produces a real `.md` file at the expected path; `getAllNotes`
  then lists it with the right `folder`, `updatedAt` and `preview`.
- `getFolders` on a hand-made nested tree (2+ levels, one dotfile present) returns the nested
  `FolderNode` tree **without** the dotfile.
- `saveNote` rewrites the file; `deleteNote` removes it; `deleteFolder` on a non-empty folder returns
  `{ok: false, error}` and leaves the folder on disk.
- `moveNote` relocates the file, returns `newId`, and a subsequent `openNote(oldId)` returns `null`.
- Unit tests on the pure id/path + tree-walk helpers pass (CODE_STYLE §14: these are the highest-value
  tests in the app).

## Phase 4 — App shell + sidebar (tree, notes list, selection, search, folder ops)

*Deps: 3.*

- [ ] Layout: sidebar (~280 px) + editor pane (~1200 px target) + status bar.
- [ ] CSS tokens on `:root` + `data-theme` dark overrides (CODE_STYLE §11.2/§11.3).
- [ ] `store/selectedFolder.ts` (Zustand) — selected folder path, `null` = "All Notes".
- [ ] Components: `FolderTree` (recursive, expand/collapse, note counts), `NotesPanel` (title, modified
      date, 60-char preview, active row highlighted), `Toolbar` placeholder, `StatusBar` placeholder.
- [ ] `+` button creating a note in the selected folder (root when none selected).
- [ ] Search box filtering the notes list by title + preview; global when no folder is selected.
- [ ] Folder context menu: New Subfolder, Rename Folder, Delete Folder (only when empty).
- [ ] Drag a note onto a folder → `moveNote`; re-key the list from the returned `newId`.

**Verification**
- The sidebar renders the real notebook tree; expanding/collapsing nests correctly.
- Selecting a folder filters the list to that folder; selecting "All Notes" shows everything.
- Typing in search filters across every folder; clearing it restores the full list.
- Creating a folder + note through the context menu/`+` appears in the list without a manual refresh.
- Dragging a note to another folder moves it on disk and the row stays selected under its new id.
- Toggling the theme flips `data-theme` on `<html>` and the whole shell follows (no per-component JS
  theme checks).

## Phase 5 — Editor: mount, hybrid render, open/save persistence

*Deps: 4. Deliberate split from Phase 6 — this half is "it renders and it persists".*

- [ ] `editor/extensions.ts`: **one** composition of the CodeMirror extensions
      (`@codemirror/lang-markdown` + `codemirror-markdown-hybrid`, KaTeX + mermaid options).
- [ ] `createEditor()` factory + a single `<HybridEditor />` wrapper; components never touch extension
      config.
- [ ] Opening a note loads its body into the editor; the focused line is raw, other lines render.
- [ ] Save on blur + 500 ms debounce while typing, through `services/notes.service.ts` (never the
      client directly).
- [ ] Guard the async/ids: switching notes mid-save must not write A's text into B.
- [ ] Status bar: word count, line count, filename + folder path.

**Verification**
- Open each of three notes in turn; the body matches the file on disk each time.
- Type, wait >500 ms, read the `.md` file directly → the text is there; blur saves immediately.
- Quit and relaunch → the last edit is still present.
- Rapidly switching notes while a debounce is pending does not corrupt either file.
- Word/line counts and the path in the status bar match the open note.

## Phase 6 — Interactive markdown: task write-back, collapse, math, mermaid, theme sync

*Deps: 5. The interactive half of the editor.*

- [ ] Task-list items render as clickable checkboxes; toggling rewrites `- [ ]` / `- [x]` **in the
      source**.
- [ ] Collapsible headings (H1–H3).
- [ ] `$$…$$` → KaTeX; ```mermaid fences → diagrams; code fences get Prism highlighting.
- [ ] Theme drives **both** the hybrid plugin and `<html data-theme>` — one source (Zustand selector).

**Verification**
- Clicking a checkbox in the rendering changes the underlying `.md` on disk (and survives reload).
- Collapsing an H2 hides its body and expanding restores it, without editing the file.
- A note containing `$$e^{i\pi}+1=0$$` renders the formula; a ```mermaid fence renders a diagram.
- A fenced JS block is syntax-highlighted.
- Theme toggle re-renders the editor preview and the shell together — no stale half-dark surface.

## Phase 7 — Toolbar (all actions) + preview mode

*Deps: 5 (actions need a mounted view). Mechanical but broad — its own phase so each action is
verified, not assumed.*

- [ ] `EditorToolbar.controller.ts`: one function per action, each dispatching against the live view.
- [ ] Actions: Bold, Italic, Strikethrough, H1/H2/H3, Bullet list, Numbered list, Task list, Quote,
      Code, Code block, Link, Image, Table, Divider, Math, Mermaid (SPEC §10.1).
- [ ] Preview-mode toggle (hybrid / split / raw).
- [ ] Confirm **no** markdown keybinds were added (toolbar-only is the spec).

**Verification**
- Every action in the list is exercised once and produces the expected markdown in the source.
- Actions work with a selection, a collapsed caret, and an empty line (insert path, not only wrap).
- The preview-mode toggle switches the surface and preserves unsaved text.
- Typing ⌘B does **not** insert bold (no keybinds; the Edit menu roles still work).

## Phase 8 — Polish, guardrails, and packaging

*Deps: 1–7. Last-mile; the v1 roadmap never reached here.*

- [ ] Empty states (no notes, no folder selected, empty folder) and a shared load-or-render primitive.
- [ ] RPC rejections surface as a visible toast — nothing swallowed silently.
- [ ] Keyboard/UX pass: tab order, focus rings, accessible controls (real `<button>`/`<a>`, `alt` text).
- [ ] Audit against the SPEC §15 gotcha list, item by item (async handlers, no `views/` writes, pinned
      version, `Utils.paths.userData` for data, Edit accelerators present).
- [ ] Grep guardrails: no `electrobun/bun` or `node:*` import under `src/mainview/`; no sync `fs` in
      `src/bun/`; no RPC client reference outside `rpc.ts` + `services/`.
- [ ] `bunx tsc --noEmit` + lint clean; storybook/tests only where CODE_STYLE §14 requires them.
- [ ] `bun run build:canary` → `electrobun run` on the built app; decide `bundleCEF` per OS.

**Verification**
- Deleting a note, deleting a non-empty folder, and reading a note that vanished underneath the app
  each produce a visible message instead of a silent no-op or a console-only error.
- The grep guardrails return zero hits.
- The built canary app launches from `build/`, opens the same notebook directory, and can create,
  edit and save a note — i.e. it is not only the dev loop that works.

---

## Explicitly not in this roadmap (SPEC §14, post-MVP)

Wikilinks `[[…]]` + backlinks · tag system (frontmatter) · markdown keyboard shortcuts · graph view ·
HTML/PDF export. Wikilinks render as plain text for now.
