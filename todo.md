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
- **Ten** methods (SPEC §12): the earlier drafts stopped at nine, and the tenth is `renameFolder`,
  which the §10.2 folder context menu has always needed. Mutations return the
  `{ ok, …payload, error? }` envelope and never throw for an expected failure (SPEC §9.1). Ids change
  on move/rename, so the renderer re-keys from `newId` / `changedIds` instead of reusing the old id.
- Editing is **toolbar-only for *formatting*** — no markdown formatting shortcuts. `enableKeymap: false`
  (the package's own default is *on*) gates the hybrid package's keymap and only that: `markdown()` from
  `@codemirror/lang-markdown` still installs its `markdownKeymap` at high precedence, so `Enter`
  (`insertNewlineContinueMarkup`) and `Backspace` (`deleteMarkupBackward`) are live and cannot be gated
  this way. Measured in the package source 2026-10-06; SPEC §10.1 records the correction. OS edit
  accelerators come from `ApplicationMenu`.
- House style: controllers + `use<X>Controller()`, Zustand for shared state, plain CSS + `cx()`,
  `@/*` → `src/mainview/`. No Tailwind, no TanStack Query, no `cn()`.
- Versions are part of the contract (SPEC §2): `react`/`react-dom` `^18.3.1`, `zustand` `^5.0.15`,
  `vite` `^6.0.1`, `typescript` `^5.6.3`. Pin before building — "latest" is how a phase ends up on an API
  nobody wrote against.
- The dev-only DOM hooks every automated check reads are pinned in **SPEC §10.6**; adding a check that needs
  a new one means adding the hook there first, not inventing a selector in the probe.
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
*Status: implemented and fully reproduced 2026-10-04 — all 7 tasks and all 6 verification lines.*

- [x] `src/shared/types.ts` with the full `NotesRPC` schema from SPEC §7 (both halves, `RPCSchema`
      type-only import from `electrobun/bun`). Each half names the side that **handles** it, `messages`
      included — a bun → view push belongs in the `webview` half (SPEC §15.21). Two entries were added
      on top of §7's list because Phase 2 needs to exercise both message directions and to read the DOM
      back; both are now written into SPEC §7.
- [x] `src/bun/index.ts`: `BrowserView.defineRPC<NotesRPC>()`, `await mkdir(NOTEBOOK_DIR, {recursive})`
      under `Utils.paths.userData`, pass the RPC object via the window's `rpc` option.
- [x] `ApplicationMenu.setApplicationMenu([...])` with the App + Edit roles (undo/redo/cut/copy/
      paste/selectAll) — without these the webview gets **no** edit accelerators. Role strings are
      unvalidated by types and land as label-less items if wrong (SPEC §15.23), so the ⌘C/⌘V/⌘Z
      verification line below was the real test, and it passed by hand — see Verification.
- [x] Call into the view from bun at least once each way — `win.webview.rpc.send.<name>({...})`
      (fire-and-forget) and one view-served request — so the bun → view direction is proven, not assumed
      (SPEC §5, §15.22). This is the one direction the schema does not exercise by itself.
- [x] `src/mainview/rpc.ts`: `Electroview.defineRPC<NotesRPC>()`, export the client
      (`electroview.rpc.request`; taken from the local binding — `Electroview.rpc` is optional and
      would need an assertion) and the instance, plus a subscription for the incoming push.
- [x] `src/mainview/services/notes.service.ts` with one **stub** path to prove the round trip end to
      end. Read literally ("the stub returns a literal root node"), a literal *inside* the service would
      prove nothing about the bridge: the literal lives in the bun handler and the service is the thin
      wrapper over it (CODE_STYLE §9.2), which is what makes the call a real round trip.
- [x] Shell renders the stub's response.

**Verification** — reproduced 2026-10-04 against `electrobun@1.18.1` + bun 1.3.14, macOS arm64
- The stub call returns a value across the bridge and it is rendered in the window: the main process
  read the view's own DOM back over the view-served request and logged
  `[bun] view DOM proof OK — … getFolders returned "Notebook" — 2 folder(s) below it.IdeasIdeas/2026
  phase-2-stub.md · 11:30:00 AM …`. The grandchild path is in there, so the recursive `FolderNode`
  shape crossed the bridge rather than a flat placeholder.
- Fire-and-forget works in both directions, confirmed separately (different schema halves):
  **view → bun** by the `viewReady` handshake — `[bun] view ready — views://mainview/index.html` is
  printed only by that message's handler; **bun → view** by `send.noteChanged(...)`, whose id the same
  DOM read finds rendered. `logToWebview` (the other declared bun → view message) is sent on the same
  path.
- `~/Library/Application Support/com.example.notes/dev/notebook/` exists on disk after launch
  (`Utils.paths.userData` = appData/identifier/channel), and relaunching does not error — runs 2 and 3
  both came up with the directory already present.
- ⌘C / ⌘V inside the window — **reproduced by hand, 2026-10-04**, in the dev window the `bun start` run
  above left open. With the `#edit-probe` textarea focused, ⌘C then repeated ⌘V copied and re-pasted the
  text each time, the caret staying at the tail of the single-row field. This is the real test of the
  whole menu block: the entries are **role-only** (no `label`, no explicit accelerator), so a passing
  ⌘C/⌘V means the roles were accepted natively *and* routed into the webview — which has no edit
  accelerators of its own (SPEC §15.8, §15.23). The role strings were also re-checked against the
  package (`roleLabelMap` carries all six — see lessons.md, which corrects the Phase 1 claim that no role
  literals exist there). ⌘Z / ⌘X / ⌘A were not exercised individually: same submenu, same mechanism.
- `bun run type-check`: `type-check OK — 0 project errors (6 known electrobun-internal error(s)
  quarantined)`.
- Freshness checked per the standing rule on every run: the launcher was alive, `Resources/app/bun/
  index.js` was newer than `src/bun/index.ts`, and each edit was greppable in the built bundle.

## Phase 3 — Notes store on disk (all ten SPEC §7 methods)

*Deps: 2. The bulk backend phase; async I/O only. The semantics are **decided**, not open — implement
SPEC §9.1 as written, including the file split from §3.*

*Status: **done and reproduced 2026-10-04** — all nine tasks and all eighteen numbered checks. The layer and
its four test files pre-existed the phase unverified; this phase **checked** rather than rewrote them (the
tests pass and every check below reproduces), and the real work was wiring the ten handlers and building the
smoke. `src/bun/index.ts` no longer answers `getFolders` with the Phase 2 stub. The layer's §9.1 rulings
(slug charset, collision scheme, title precedence, the dot-skip, the error strings) are untouched.*

- [x] `src/bun/notes/` filesystem layer, one concern per file (SPEC §3) — **was already on disk**, so this
      task was to *check* it rather than write it: `paths.ts` (id ↔ path mapping + containment checks),
      `meta.ts` (pure derivations — title, preview, slug), `tree.ts` (walk → `FolderNode`, plus
      `listAllNotes`), `read.ts` (`readNote` — open a note and derive its meta), `write.ts`
      (create/save/delete/move + folder create/delete/rename), with `index.ts` as the barrel
      `src/bun/index.ts` imports. Checked and left unrewritten, per the Status note: all four test files
      pass and every numbered check reproduces.
- [x] Handlers for all ten methods: `getAllNotes` (meta + 60-char preview, no bodies, `updatedAt`
      desc), `getFolders` (recursive `FolderNode`, root `{ path: "", name: "Notebook" }`), `openNote`
      (body on demand, `null` when absent), `saveNote`, `createNote` (slugged filename, collision
      suffix, returns the new `note`), `deleteNote`, `createFolder`, `deleteFolder` (fails with
      `folder not empty`), `moveNote` (returns `newId`), `renameFolder` (returns `changedIds` — the
      Phase 4 context menu needs it).
- [x] Define all ten as **one named object** (`notesHandlers`) passed to
      `BrowserView.defineRPC({ handlers: { requests: notesHandlers } })`, **not** an inline literal. The
      object handed *in* is the only handle on the handlers — what `defineRPC` returns exposes
      `setTransport`/`request`/`send`/… but no read-back of the handler map (measured) — and it is what
      lets the smoke drive the wiring without a round trip. Type it from the schema so a missing, extra or
      misnamed method is a compile error. Refines SPEC §5's sample; the handler bodies are unchanged.
- [x] Every mutation returns the §7 envelope with the §9.1 error strings (`not found`, `invalid id`,
      `invalid name`, `already exists`, `folder not empty`) — never a thrown exception for an expected
      failure.
- [x] All handlers `async` with `node:fs/promises` — no sync I/O (SPEC §9, §15.6). Writes are
      temp-file-then-`rename` (SPEC §9.1).
- [x] Path safety: ids, names and paths that escape `NOTEBOOK_DIR` are **rejected, not normalised**
      (SPEC §9.1).
- [x] `bun test` wired up — add the `test` script to `package.json` (§4.3, §9.2), with `paths.test.ts`,
      `meta.test.ts`, `tree.test.ts` and `write.test.ts` beside their subjects.
- [x] Dev-only boot smoke (`channel === "dev"` only): run the **numbered checks under Verification**
      against the real `NOTEBOOK_DIR`, in order (1–13 call the notes-layer barrel; 14–17 call the
      `notesHandlers` object the window dispatches through), printing exactly one
      `[smoke] N ok — <what was observed>` or `[smoke] N FAIL — expected <x>, saw <y>` line per check, and
      removing everything it created in a `finally` so a failed check leaves no litter.
      **Deviation from this task's original wording:** the smoke lives in `src/bun/smoke.ts`
      (`runPhase3Smoke`), invoked from `src/bun/index.ts`, rather than inline — 300+ lines of checks do not
      belong in the wiring module (CODE_STYLE §3, §12.1). Temporary; it goes once Phase 4 exercises the
      methods for real (see the closing line under Verification).

**Verification** — reproduced 2026-10-04 against `electrobun@1.18.1` + bun 1.3.14, macOS arm64

- The boot smoke printed exactly one line per check; all seventeen `ok`, ending
  `[smoke] done — 0 failure(s); notebook cleared`. Verbatim, checks 2 (the corrected one), 6 (the
  corrected one), 15 and 17:

  ```
  [smoke] 2 ok — untitled.md:untitled untitled1.md:untitled mynote.md:mynote
  [smoke] 6 ok — ["-root.md","Archive/Old.md","Ideas/2026/other.md","Ideas/2026/plan.md","mynote.md","untitled.md","untitled1.md"] plan.title="plan"
  [smoke] 15 ok — create=handlerprobe.md openNote.content=string save=1791141787371 listHasBody=false folder=HandlerFolder moved=HandlerFolder/handlerprobe.md changedIds=[{"from":"HandlerFolder/handlerprobe.md","to":"HandlerFolderRenamed/handlerprobe.md"}] root=Notebook deleted=true/true
  [smoke] 17 ok — ok=true path=casedir changedIds=[{"from":"CaseDir/n.md","to":"casedir/n.md"}] opened="body"
  ```

- Check 18: `bun run test` → `44 pass, 0 fail, 133 expect() calls` across the four `src/bun/notes/*.test.ts`.
- `bun run type-check` → `type-check OK — 0 project errors (6 known electrobun-internal error(s) quarantined)`.
- Freshness, per the standing rule: the launcher was alive; `Resources/app/bun/index.js` was newer than
  `src/bun/index.ts`; `runPhase3Smoke` and `notesHandlers` are greppable in the built bundle, and
  `STUB_FOLDER_TREE` is gone from it.
- The notebook was **empty** after the run (`~/Library/Application Support/com.example.notes/dev/notebook/`,
  0 entries) — the smoke's `finally` removed everything it created.
- Phase 2's bridge proof still passes: `[bun] view DOM proof OK — the bun → view push rendered: …`.

The smoke prints exactly one line per numbered check, in the fixed form `[smoke] N ok — <what was
observed>` or `[smoke] N FAIL — expected <x>, saw <y>`, and runs them in this order (later checks build on
earlier ones). Checks 1–13 exercise the notes-layer functions; 14–17 exercise the handler map in
`src/bun/index.ts` — the phase's own new code, and the one thing a layer-only smoke cannot reach. A single
`FAIL` means the phase is not done. These checks are the acceptance criteria — the prose list they replace
was not reproducible.

1. `createNote(NOTEBOOK_DIR, "", "My Note")` → `{ ok: true }`, the returned `note.id` is `mynote.md`, that
   file exists and is 0 bytes, `note.title` is `mynote`, `note.preview` is `""`.
2. Two more `createNote(NOTEBOOK_DIR, "", "")` calls → ids `untitled.md` then `untitled1.md` (the lowest
   free number, added after slugging), and `getAllNotes` titles **both of those** `untitled` — their stems
   match the no-title pattern and an empty body has no H1 to fall back to. `mynote.md` from check 1 keeps
   its name: only an untitled note reaches the body.
3. `writeNote(NOTEBOOK_DIR, "untitled.md", "# Hello, World!\n\nbody")` → that row now titles
   `Hello, World!` with a preview starting `# Hello, World!`, and its `id` is **still** `untitled.md`. A
   filename comes only from `createNote`'s `title` argument; only an untitled note uses the H1 fallback.
4. `getAllNotes` comes back `updatedAt` descending, ties broken by `id` ascending, and every row carries
   `folder`, `title`, `preview` and **no** `content`.
5. Hand-make `Ideas/2026/plan.md`, `Ideas/2026/other.md`, `Ideas/notes.txt`, `Ideas/.hidden.md`,
   `.secret/deep.md`, `Archive/Old.md`, `-root.md`, then `getFolders` → root
   `{ path: "", name: "Notebook" }` containing `Ideas` (with child `2026`) and `Archive` — no dot-file, no
   dot-directory, and `Ideas` is still walked even though `notes.txt` is not a note.
6. With that tree present, the ids from `getAllNotes` are exactly `-root.md`, `Archive/Old.md`,
   `Ideas/2026/other.md`, `Ideas/2026/plan.md`, `mynote.md`, `untitled.md`, `untitled1.md` (checks 1–3 are
   still on disk — both untitled notes survive), and `plan`'s title is `plan`. The name beats the H1.
7. `readNote(NOTEBOOK_DIR, "Ideas/2026/plan.md")` returns the body; `readNote` on a missing id returns
   `null`, not an error.
8. `createFolder(NOTEBOOK_DIR, "Ideas", "Drafts")` → `ok`; the identical call again → `already exists`.
   `createFolder` does not slugify and does not create missing parents.
9. `createNote(NOTEBOOK_DIR, "Ideas/Drafts", "Draft")` → `Ideas/Drafts/draft.md`;
   `deleteFolder(NOTEBOOK_DIR, "Ideas/Drafts")` → `{ ok: false, error: "folder not empty" }` **and** the
   directory is still on disk.
10. `deleteNote(NOTEBOOK_DIR, "Ideas/Drafts/draft.md")` → `ok` and the file is gone; the repeat →
    `not found`; `deleteFolder` on `Ideas/Drafts` now → `ok`.
11. `moveNote(NOTEBOOK_DIR, "Ideas/2026/plan.md", "Archive")` → `{ ok: true, newId: "Archive/plan.md" }`,
    the file is at the new path, and `readNote` on the old id → `null`. `moveNote` into the note's own
    folder → `{ ok: true, newId: <the same id> }` with the file's mtime unchanged (no disk touch).
12. `renameFolder(NOTEBOOK_DIR, "Ideas", "Notes")` → `changedIds` covering every descendant (here exactly
    `{ from: "Ideas/2026/other.md", to: "Notes/2026/other.md" }`), and each `to` id opens the right file
    while its `from` id → `null`.
13. Path safety: `../x.md` and `/etc/passwd` as an id, `Ideas/../../x.md` as a folder path, and a name
    containing `/` each return `{ ok: false, error: "invalid id" }` or `"invalid name"` as §9.1 says, and
    nothing outside `NOTEBOOK_DIR` appears afterwards. `deleteFolder(NOTEBOOK_DIR, "")` → `invalid name`.
14. **Handler coverage.** `Object.keys(notesHandlers)` is exactly the ten SPEC §7 request names — none
    missing, none extra — and every value satisfies `fn.constructor.name === "AsyncFunction"`. The ten
    handlers are the phase's deliverable; nothing above this line touches them.
15. **Every handler is driven once** through `notesHandlers` against the real `NOTEBOOK_DIR` and answers its
    SPEC §7 shape: `createNote({ folder: "", title: "Handler Probe" })` → `{ ok: true, note.id:
    "handlerprobe.md" }`; `openNote({ id })` → a `NoteMeta` carrying `content`; `saveNote({ id, content })` →
    `{ ok: true, updatedAt }`; `getAllNotes({})` → that note present, with **no** `content` field;
    `createFolder({ parent: "", name: "HandlerFolder" })` → `{ ok: true, path: "HandlerFolder" }`;
    `moveNote({ id, targetFolder: "HandlerFolder" })` → `{ ok: true, newId:
    "HandlerFolder/handlerprobe.md" }`; `renameFolder({ path: "HandlerFolder", name: "HandlerFolderRenamed" })`
    → `{ ok: true, changedIds: [{ from: "HandlerFolder/handlerprobe.md", to:
    "HandlerFolderRenamed/handlerprobe.md" }] }`; `getFolders({})` → the root node; `deleteNote({ id })` →
    `{ ok: true }`; `deleteFolder({ path: "HandlerFolderRenamed" })` → `{ ok: true }`. This is the wiring
    test: a param destructured under the wrong name (e.g. `{ path }` in `openNote`), or a handler bound to
    the wrong layer function, fails here and nowhere else.
16. **`deleteFolder` refuses a folder whose only contents are not notes** (SPEC §9.1 — *any* directory entry
    counts). Create `HandlerFolder2`, drop a lone `.DS_Store` inside it, call the `deleteFolder` handler →
    `{ ok: false, error: "folder not empty" }` with the directory still on disk; remove the `.DS_Store` and
    call again → `{ ok: true }`. Check 9 proves only the `.md` case, so this is the ruling's actual test.
17. **A case-only folder rename is legal, not a collision** (SPEC §12). Make `CaseDir/n.md`, then
    `renameFolder({ path: "CaseDir", name: "casedir" })` → `{ ok: true, changedIds: [{ from: "CaseDir/n.md",
    to: "casedir/n.md" }] }`, and `openNote({ id: "casedir/n.md" })` still returns the body. Do **not** assert
    the old id fails: on APFS the old spelling still resolves — which is exactly why a case-only rename must
    not be pre-checked and rejected as `already exists`.
18. `bun run test` passes (SPEC §9.2; CODE_STYLE §14 — the highest-value tests in the app).

The smoke is the only Phase 3 channel that reaches the ten methods: `bun test` drives the pure layer against
a `mkdtemp` fixture, while the smoke drives the barrel **functions** (checks 1–13, every §9.1 ruling) and the
handler **map** (checks 14–17, the wiring the phase actually writes) against the real `NOTEBOOK_DIR`. Both
halves are needed, and the handler half is only possible because `notesHandlers` is the object literal handed
to `defineRPC` — what `createRPC` returns exposes `setTransport`/`request`/`send`/… but no read-back of the
handler map (measured), so the *input* object is the only handle. Phase 2 already proved the bridge itself;
nothing here needs to cross the wire, and Phase 4 is where the UI exercises the methods for real.

## Phase 4 — App shell + sidebar (tree, notes list, selection, search, folder ops)

*Deps: 3, plus `zustand` `^5.0.15` — the only dependency this phase adds (SPEC §2). Component names and UI
semantics are decided in SPEC §10.5; the dev-only DOM hooks every check below reads are pinned in **SPEC
§10.6**.*

*Files:* `src/mainview/` — `App.tsx` + `App.controller.ts`, `main.tsx`, `rpc.ts`, `index.html`, `styles.css`,
`store/{selectedFolder,selectedNote,draftNote,theme}.ts`, `hooks/useDebouncedValue.ts`,
`services/notes.service.ts`, `utils/{cx,errorMessage,folderTree,noteDrag,noteFilter,rekey,truncateSnippet}.ts`
(the pure ones each with a co-located `.test.ts`), and `components/{Sidebar,FolderTree,NotesPanel,SearchBox,
Toolbar,StatusBar,Loading,EditorPane,FolderNameInput,FolderContextMenu}/`.

- [x] Layout: sidebar (~280 px) + editor pane (~1200 px target) + status bar.
- [x] CSS tokens on `:root` + `[data-theme="dark"]` overrides (CODE_STYLE §11.2/§11.3).
- [x] Stores (Zustand, one file each, reached only through controllers): `store/selectedFolder.ts`
      (`string | null`, `null` = "All Notes"), `store/selectedNote.ts` (`string | null` — the active
      row, and what Phase 5 opens), `store/draftNote.ts` (`{ folder: string } | null` — a new note with
      no file yet), `store/theme.ts` (`"light" | "dark"`, persisted with Zustand `persist`; the store
      stays DOM-free so `bun test` can load it, and `App.controller.ts` is the single writer of
      `<html data-theme>`, initial value from the stored preference else `prefers-color-scheme`).
- [x] Components (§10.5): `FolderTree` (recursive, expand/collapse with ancestors auto-expanded,
      recursive note counts), `NotesPanel` (title, modified date, 60-char preview, active row
      highlighted), `Toolbar` and `StatusBar` placeholders.
- [x] `+` button → starts a draft (`draftNote = { folder: selectedFolder ?? "" }`); it writes **nothing**.
      Committing a title creates the note through `createNote` and selects the returned `note.id`;
      skipping the title and typing a body creates it on the first save with `title: ""` (SPEC §10.5).
      The title input itself is Phase 5; Phase 4 stages the draft and exposes it as `data-draft-folder`.
- [x] Search box filtering the notes list by title + preview — case-insensitive substring, ~150 ms
      debounce, scoped to the selected folder's subtree or global when none is selected, the query
      surviving a folder switch (SPEC §10.4, §10.5).
- [x] Folder context menu: New Subfolder, Rename Folder (`renameFolder`, then re-key the list from
      `changedIds`), Delete Folder (only when empty).
- [x] Drag a note onto a folder → `moveNote`; re-key the list and the selection from the returned
      `newId`; a drop on the note's current folder is a no-op; a failure reverts the row.
- [x] Retire the Phase 2 DOM probe: `src/bun/domProbe.ts` is **deleted**, and `src/bun/phase4Probe.ts` runs
      after the Phase 3 smoke in `bun start` (§15.22). **Corrected 2026-10-06:** Phase 5 retired that
      textarea (it is no longer in the tree); the ⌘C/⌘V/⌘Z manual check now targets the editor body
      itself, as Phase 4's manual item 5 and SPEC §10.6 record.
- [x] The tree's flattening helper (`flattenFolderPaths`) is gone; `utils/folderTree.ts` exports
      `ancestorFolderPaths` + `noteCountsByFolder` instead, which is what the tree and the counts use.

**Verification** — automated half reproduced 2026-10-04; the manual list is awaiting a human run.

*Channels.* `bun test` drives the pure layer (80 tests / 9 files: the notes layer + `src/mainview/utils/*`,
each test co-located). The dev probe `src/bun/phase4Probe.ts` is the only Phase 4 channel that reads the
live DOM: `bun start` runs it after the Phase 3 smoke, it drives the shell through 20 numbered checks,
and it removes its own `Probe…` fixture in `finally` — the notebook must be empty afterwards. Each line
below names the check that reproduces it.

1. The sidebar renders the real notebook tree; expanding/collapsing nests correctly. *(1–3)*
2. Selecting a folder filters the list to that folder; selecting "All Notes" shows everything. *(4–5)*
3. Typing in search filters the list by title **and** preview without a manual refresh; clearing it
   restores the full list. *(6–7, 10)*
4. Search is case-insensitive and scoped: with a folder selected it ignores notes outside that subtree;
   on "All Notes" it finds a note nested two levels down. *(8–9)*
5. Creating a **folder** through the context menu appears in the list without a manual refresh. *(13)*
   The note half of the old line belongs to Phase 5 — no way to create a note exists until the title
   input does.
6. Dragging a note to another folder moves it on disk and the row stays selected under its new id.
   *(16, driven by a synthetic `DragEvent`; 15 is the wiring, 17 the no-op drop on the current folder)*
7. Renaming a folder that holds notes leaves every note openable — the list re-keys from `changedIds`
   and the selected note stays selected under its new id. *(14)*
8. Delete Folder is offered only when the folder is empty, and Escape closes the context menu. *(18)*
9. Toggling the theme flips `data-theme` on `<html>` and the whole shell follows (no per-component JS
   theme checks). *(11)*
10. `+` opens a draft and writes **no** file: click it, then abort by selecting another note — the
    notebook on disk is unchanged, with no `untitled.md` litter. *(12)*
11. The theme persists: `localStorage` works under the `views://` origin and holds the store's key *(19)*,
    and a value written there is the live theme at the next boot *(20 — run the probe twice; the second
    run writes the first run's value back)*.

*Manual — nothing can drive these from a script.*
1. The real OS drag gesture (mouse down → move → release) on the running window.
2. The visual layout at the default window size: sidebar width, the editor pane's max width, status bar.
3. The inline name input's edges: Escape cancels, blur commits, an empty name is refused.
4. Theme end to end: click the status-bar toggle, quit, relaunch — the choice is still in effect. (The
   probe covers the storage half out of band; this covers the click.)
5. ⌘C / ⌘V / ⌘Z in the editor pane (the ApplicationMenu roles, SPEC §5). **Updated 2026-10-06:** the
   Phase 2 `#edit-probe` textarea this item named no longer exists — Phase 5 retired it (§10.6) — so
   the editable target is now the editor body itself.

## Phase 5 — Editor: mount, hybrid render, open/save persistence

*Deps: 4, plus the editor package pinned (below). Deliberate split from Phase 6 — this half is "it
renders and it persists".*

*Status: **done — 10/10 tasks, 14/14 verification lines** (2026-10-05/06, two macOS machines: four probe
suites in this checkout, one from a fresh clone on the second machine, plus the manual pair by hand). Line
12's fenced-code clause moved to Phase 6, which already asserted it; line 14 was added this session by the
empty-state decision. See *Outcome* under Verification.*

```bash
bun add codemirror-markdown-hybrid@1.2.2 @codemirror/state@^6 @codemirror/view@^6 \
  @codemirror/commands@^6 @codemirror/lang-markdown@^6
```

*Read first:* SPEC §10.1 (this phase's contract, including the dev-only read-back), §10.3 (status bar
formats), §9.1 (save points, `noteChanged`), §10.5 (`+`, drafts, theme), §15.22 (the probe channel).

*Creates:* `src/mainview/editor/{extensions.ts,createEditor.ts}`,
`src/mainview/components/EditorPane/{EditorPane.tsx,EditorPane.controller.ts}`,
`src/mainview/components/TitleInput/{TitleInput.tsx,TitleInput.controller.ts}`, and the dev-only
`src/bun/phase5Probe.ts`. *Retires:* the `EditorPane` placeholder with its `#edit-probe` textarea (Phase
2's channel, deliberately kept through Phase 4). **Corrected 2026-10-06:** the task also said it retires
the `data-draft-folder`-only draft surface — it does not, and must not: `phase4Probe.ts` still reads that
attribute (`#sidebar` carries it), so it stays as Phase 4's channel while `#editor-pane` gains
`[data-note-id]`/`[data-dirty]` and `window.__notesEditor` alongside it (§10.1). Grep SPEC §3 for anything
this phase removes (R9).

- [x] `editor/extensions.ts`: **one** composition — `hybridMarkdown({ theme, enablePreview: true,
      enableKeymap: false, enableCollapse: true })`. **Corrected 2026-10-06:** this line originally said
      "plus `@codemirror/lang-markdown`". The code deliberately adds no second copy, because
      `hybridMarkdown()` already bundles `markdown()`, `history()`, the default keymap and line wrapping
      (measured against the package; see `src/mainview/editor/extensions.ts`). `enableKeymap: false`
      is load-bearing: the package's formatting keybindings are **on by default** and §10.1 is
      toolbar-only (Phase 7's ⌘B check depends on this line).
- [x] `createEditor()` factory + a single `<HybridEditor />` wrapper; components never touch extension
      config. The view goes to `window.__notesEditor` in `dev` — the only way any check can read or
      drive this editor, since its document is not in the DOM (§10.1). **Corrected 2026-10-06:** this
      line said the *factory* assigns the handle; it is `EditorPane.controller.ts` that does, gated on
      bun's `viewContext` push — same guarantee, different owner.
- [x] Title input above the body (§10.1, §10.5): focused when a draft opens, `Untitled` placeholder, input
      constrained to the slug charset and lowercased, Enter/Tab/blur committing **identically**, Tab
      continuing into the body, `readOnly` (not `disabled`) once the note exists.
- [x] Committing a draft's title calls `createNote` **once**, clears `draftNote`, and selects the returned
      `note.id`; typing into the body instead creates the note on the first save (500 ms debounce or blur,
      whichever comes first) with `title: ""`. The editor binds to the returned id, never to the typed
      name — a collision returns `plan1` (§10.5).
- [x] Opening a note focuses the body at line 1 and loads its content. The body is loaded **only** on
      selection change: a `noteChanged` refresh never reloads it, or a save would move the cursor (§9.1).
- [x] Save on blur + 500 ms debounce while typing, through `services/notes.service.ts` (never the RPC
      client directly); flush a pending save before switching notes.
- [x] Guard the async/ids: capture the note id at save time and drop the result if the selection moved, so
      a switch mid-save cannot write A's text into B.
- [x] Status bar: word count, line count and `filename · folder` from the **live document** (§10.3),
      returning to `—` when no note is open.
- [x] `noteChanged` is pushed by the **bun handlers** after a successful `createNote`/`saveNote` (§9.1);
      the renderer only refreshes the tree and the list.
- [x] **The empty state has no body to type into** (§10.1, added 2026-10-06 after the author hit it):
      with no note and no draft open, `#editor-placeholder` shows and the editor host is hidden by
      `.editor__host_hidden` — mounted, never unmounted, so the CodeMirror view survives, and
      re-measured on reveal. Before this, keystrokes there were accepted by the DOM and dropped by the
      controller, which saves only when a note is bound or a draft is active.

**Verification** — automated unless marked *(manual)*.

**Outcome — 2026-10-05/06. All 14 lines reproduced** (13 original + line 14, added this session).
`src/bun/phase5Probe.ts` passed in four runs on two macOS machines — three in this checkout (the fourth
wedged at check 8 and is recorded in `debug.md` E16), one from a fresh clone on the second machine —
48 ok lines each when the notebook was clean (17 smoke + 20 Phase 4 + 11 Phase 5, **0 FAIL**), alongside
`bun run test` **95 pass / 0 fail / 200 expect() calls** and `bun run type-check` **0 project errors**
(6 electrobun-internal quarantined). Note the false-green to watch: in the last run the Phase 3 smoke
**skipped** because the notebook held two hand-made notes, so the total read 31 rather than 48 — the
smoke announces the skip, and it is not a failure, but a clean notebook is what makes the suite's
counts mean anything.

- **12 (hybrid render)** — the focused line shows its source verbatim (`**Bold**`, asterisks visible,
  active line highlighted) while the neighbouring `# Hybrid check` renders as a heading with no `#`;
  moving the caret off the bold line renders it as **Bold** with the asterisks gone. Both directions,
  screenshots, second machine. The probe's boot diagnostic agrees (`cmContent: "›Alphaalpha-unique-body"`
  for `# Alpha…`). The fenced-code clause moved to Phase 6 (below).
- **13 (theme)** — toggled to light → ⌘Q → relaunch → **light on a dark-mode Mac**, so the stored value
  beat the `prefers-color-scheme` fallback; toggled to dark → relaunch → dark. The visual half is in the
  same screenshots: the editor's paper dark with the sidebar and status bar, no half-dark seam.
- **Line 10 gained a branch.** The probe's check 10 types a body with **no** H1, so it only ever
  exercised the `untitled` title branch; by hand, a title-less note took its list title from the body's
  first ATX H1 (§9.1's `deriveTitle`), and the sidebar also showed an H1 *below* line 1 winning
  (`hello # Why ?` → `Why?`), which is the "anywhere in the body" clause.
- **14 (empty state)** — added 2026-10-06 after the author hit it: see the task line above and §10.1.
  Manual, and five seconds: a fresh `PROBE_SKIP=1` launch shows the message and no body.

**Why the fenced-code clause moved to Phase 6.** Phase 6's fourth line asserts the identical thing ("A
fenced JS block is syntax-highlighted"), so the clause was duplicated; and a verdict needs a *valid*
block, which the MVP cannot yet produce without fighting the editor's auto-close — typing three backticks
inserts a matching run, so text typed "inside" lands on the same line and the fence never closes (measured
2026-10-06; filed as a Phase 7 item, since the package's `codeBlock` action is the intended route).

*Channels.* `bun test` for anything pure; `src/bun/phase5Probe.ts` for the live window, chained after the
Phase 4 probe in `bun start`. It drives the editor through `window.__notesEditor` (the document is not in
the DOM), seeds its own notes, asserts the bytes on disk, and removes them in `finally` — the notebook
must be empty afterwards.

1. Opening each of three seeded notes shows that note's body, and the file is unchanged afterwards.
   *Failure:* the pane shows the previous note, or an empty document.
2. Typing then waiting >500 ms writes the text to the `.md` on disk. *Failure:* the file lags, or holds
   another note's text.
3. Blur saves immediately — type, blur, read the file without waiting out the debounce. *Failure:* the
   file still holds the pre-edit content.
4. Quitting inside the debounce loses the last edit and nothing more (§9.1 — accepted): type, wait
   >500 ms, quit — the probe asserts the bytes on disk before exiting, and a relaunch re-opens it
   *(the relaunch and the open are manual)*. *Failure:* a truncated or half-written file, or the text
   missing after a completed wait.
5. Switching notes while a debounce is pending leaves both files correct, each with its own text.
   *Failure:* B receives A's text, or the save lands on the wrong id.
6. Word/line counts and the path match the open note and track edits (type a word → the counts change);
   with no note open every field is `—`. *Failure:* counts derived from the file rather than the live
   document, or stale after a switch.
7. `+` puts the caret in the title field; Tab with an **empty** field reaches the body and creates nothing
   (`#editor-pane[data-note-id]` absent, notebook unchanged). *Failure:* a file appears anyway.
8. Type `plan`, press Enter → `plan.md` exists, the list shows `plan`, the row is selected, and the editor
   is bound to the returned id. *Failure:* no file, or no selected row.
9. Collision: with `plan.md` already present, committing `plan` yields `plan1.md` and the list shows
   `plan1` (§10.5). *Failure:* `plan.md` overwritten, or the typed name selected instead of the returned id.
10. `+`, Tab straight into the body, type a line → `untitled.md` holds exactly that line with **no** title
    line, and the list shows the body's first H1 if there is one, else `untitled` (§9.1).
11. Opening the `.md` file directly shows only body text — the title is not written into it.
12. *(manual)* The body renders hybrid as specified: the focused line raw, every other line rendered
    (bold/headings visible). **Reproduced 2026-10-06** (screenshots, both directions). The fenced-code
    clause **moved to Phase 6** on 2026-10-06 — Phase 6's fourth line already asserts the same thing, and
    a verdict needs a code block the app cannot yet create without fighting the editor's auto-close (see
    Phase 7). Task-list write-back, collapse and math/mermaid are Phase 6's checks — §2 pins their
    versions.
13. *(manual)* The editor opens in the stored theme and follows a status-bar toggle without a stale
    half-dark surface. Phase 5 owns the initial value, Phase 6 the live sync (§10.1).
    **Reproduced 2026-10-06** on the second (dark-mode) machine, both directions, including the
    persistence discriminator a dark host needs: toggle to light → relaunch → still light.
14. *(manual, added 2026-10-06)* With nothing open — a fresh `PROBE_SKIP=1` launch — the pane shows the
    empty-state message and **no body**: `#editor-pane[data-body-visible="false"]`, and there is nothing
    to click or type into. Opening a note or pressing `+` flips it to `"true"` and the body appears.
    *Failure:* the field is visible and typeable with nothing open — the state that silently discarded
    keystrokes. See §10.1 and §10.6 for the rule and the hook.

## Phase 6 — Interactive markdown: task write-back, collapse, math, mermaid, theme sync

*Deps: 5. The interactive half of the editor.*

*Status: **ready to start** (pre-flight 2026-10-06; both blockers closed below). Deps are green — nothing
to install, since all four features are already in the build (`codemirror-markdown-hybrid@1.2.2` and
`katex ^0.16.47` declared; 81 katex/mermaid/diagram chunks already emitted into `dist/assets`). The two
things that were missing — the rendered-content hooks and the four semantics — are now pinned (SPEC §10.6,
and the decisions below).*

*Measured 2026-10-06: **this phase is almost entirely verification, not implementation.*** The pinned
package already provides the write-back (`lib/extensions/hybrid-preview.js:183` finds the clicked checkbox
and rewrites the source), the collapse control, KaTeX and Mermaid rendering, and the fence highlighting;
Phase 5 wired the live theme switch (`setTheme` off the store). The write-back therefore flows through the
**existing** save path — the package's document change fires the app's `updateListener`, which schedules
the same debounced save a keystroke would, which pushes `noteChanged`. So the tasks below read as *make
these true and prove them*, not *write these*: the real deliverable is `phase6Probe.ts` and its seven
checks.

*Files:* `src/bun/phase6Probe.ts` — dev-only, chained after `phase5Probe` in `bun start`, seeding its own
`Probe6` fixture and removing it in `finally` like its predecessors. **No new handler or RPC method:** a
checkbox write-back is an ordinary body save.

*Decisions — pinned 2026-10-06:*
1. **A checkbox click saves through the normal path.** 500 ms debounce, blur flush, `data-dirty` true
   meanwhile — the same mechanism as typing. *Reason:* one write path means one set of failure modes, and
   §9.1's accepted quit-inside-the-window loss then applies uniformly. *Beat:* an immediate save on toggle
   (a second write path to build and test for one discrete action) and a view-only toggle (which would
   leave the list's preview and mtime stale).
2. **A write-back pushes `noteChanged`.** It is a successful write to a note, which is exactly what §9.1's
   push rule covers, so there is no exception to record. *Reason:* the sidebar's mtime and preview must
   move when a task is ticked, precisely as they do after typing. *Beat:* treating it as a view-only
   action.
3. **Collapse state is ephemeral.** Never written to the file, and not preserved across a note switch or a
   reload — coming back shows everything expanded. *Reason:* it is view state for the open document, held
   per view by the package. *Beat:* persisting collapse per note, which is new state and a new storage
   decision for a convenience nobody asked to keep.
4. **"The preview followed the theme" is one computed style.** The check compares a rendered element's
   computed `color` (a rendered heading is the natural subject) before and after the toggle. This is the
   **one deliberate exception** to §10.6's presence-only rule, and it is recorded there too. *Reason:*
   presence cannot fail — a stale half-dark preview has every element present, so a presence-only check
   would report a pass on the exact defect the line exists to catch. *Beat:* presence-only, i.e. a check
   that cannot fail.

- [ ] Task-list items render as clickable checkboxes; toggling rewrites `- [ ]` / `- [x]` **in the
      source**.
- [ ] Collapsible headings (H1–H3).
- [ ] `$$…$$` → KaTeX; ```mermaid fences → diagrams; code fences get the hybrid package's own
      CodeMirror/Lezer highlighting (the package has no Prism, so nothing is added for that — §2). Math
      and mermaid are always-on features with no options to pass.
- [ ] Theme drives **both** the hybrid plugin and `<html data-theme>` — one source (Zustand selector), the
      live switch being `setTheme(view, theme)` off the store (§10.1). Phase 5 owned the initial value.
      **Observable (pinned 2026-10-06):** a rendered element's computed colour changes with the toggle —
      §10.1 and §10.6 name this as the one exception to the presence-only rule, because presence alone
      cannot fail here.

**Verification** — automated through `phase6Probe.ts` unless marked *(manual)*. Each line names the
observation it prints; the rendered subtree is `#editor-pane .cm-content` and the classes are the ones
pinned in SPEC §10.6. **Shape rewritten 2026-10-06** (prose → numbered checks naming their observation);
the content is unchanged except where noted.

1. Clicking a rendered task checkbox rewrites that line's `- [ ]` ↔ `- [x]` in the **source**, and the
   `.md` on disk matches once the save settles (decision 1/2 fixes what "settles" means). *Failure:* the
   file still holds the old marker, or the change lands on another line.
2. The same toggle survives a reload: reopen the note and the checkbox is in the new state.
3. Collapsing an H2 hides its body (`.cm-collapsed-line` present below it) and expanding restores it,
   with the `.md` **byte-identical** before and after. *Failure:* the file changed — collapse is a view
   state, not an edit.
4. A note containing `$$e^{i\pi}+1=0$$` renders the formula: `.cm-math-preview` present with the KaTeX DOM
   inside it.
5. A ```mermaid fence renders a diagram: `.cm-mermaid-preview` present, **polled to a deadline** because
   the diagram chunk loads asynchronously. *Failure:* asserted from a single read.
6. A fenced JS block is syntax-highlighted: the fence's rendered lines carry token spans, not one uniform
   class. **Moved here from Phase 5 on 2026-10-06** — it was duplicated, and a verdict needs a valid block,
   which only Phase 7's toolbar action can create without fighting the editor's auto-close.
7. The theme toggle re-renders the editor preview **and** the shell together — decision 4's observation
   holds for the rendered surface while `<html data-theme>` flips. *Failure:* a stale half-dark preview.

## Phase 7 — Toolbar (all actions) + preview mode

*Deps: 5 (actions need a mounted view). Mechanical but broad — its own phase so each action is
verified, not assumed.*

- [ ] `EditorToolbar.controller.ts`: one function per action, each dispatching against the live view
      through the package's `actions` map (`hr` = Divider, `diagram` = Mermaid, `inlineCode` = Code).
- [ ] Actions: Bold, Italic, Strikethrough, H1/H2/H3, Bullet list, Numbered list, Task list, Quote,
      Code, Code block, Link, Image, Table, Divider, Math, Mermaid (SPEC §10.1). Math has **no** package
      action — it inserts `$$…$$` by hand (§2).
- [ ] Preview-mode toggle (hybrid / raw, via `toggleHybridMode` / `setMode`); the package has no split
      mode, so the earlier "hybrid / split / raw" wording is withdrawn (§2).
- [ ] Confirm **no markdown *formatting* keybinds** are live: the composition sets `enableKeymap: false`
      (Phase 5's line, and the reason it exists) — this item is the behavioural proof, not new work. Note
      what is *not* gated and cannot be: `@codemirror/lang-markdown`'s `markdownKeymap` keeps `Enter`
      (continues a list/fence) and `Backspace` (deletes markup) live even with the flag off (measured
      2026-10-06, SPEC §10.1), so ⌘B still not inserting bold is the thing to prove, and structural
      continuation is not a failure.
- [ ] **Check that a code block can actually be created through the toolbar.** Measured 2026-10-06:
      hand-typing a fence fights the editor's auto-close — three backticks insert a matching run, so text
      typed "inside" lands on the same line, producing an unclosed fence that swallows the rest of the
      document (Enter then grows the block, and there is no "outside" to click into). The package's
      `actions.codeBlock` is the intended route and this phase wires it; until then there is no
      frictionless way to make a valid block, which is why Phase 5's fenced-code clause moved here.

**Verification**
- Every action in the list is exercised once and produces the expected markdown in the source.
- Actions work with a selection, a collapsed caret, and an empty line (insert path, not only wrap).
- The preview-mode toggle switches the surface and preserves unsaved text.
- Typing ⌘B does **not** insert bold (no keybinds; the Edit menu roles still work).

## Phase 8 — Polish, guardrails, and packaging

*Deps: 1–7. Last-mile; the v1 roadmap never reached here.*

- [ ] Empty states (no notes, no folder selected, empty folder) and a shared load-or-render primitive.
- [ ] A failed mutation (`{ ok: false, error }`, SPEC §9.1) and every RPC rejection surface as a
      visible toast — nothing swallowed silently.
- [ ] Keyboard/UX pass: tab order, focus rings, accessible controls (real `<button>`/`<a>`, `alt` text).
- [ ] First paint: `index.html` hardcodes `data-theme="light"`, so a dark-theme user sees one light frame
      before the shell applies the stored value (SPEC §10.5, §10.6). Set `color-scheme` on `:root` and read
      the stored theme before first paint.
- [ ] Remove the unread `data-theme-value` attribute on `#status-bar` (SPEC §10.6).
- [ ] Audit against the SPEC §15 gotcha list, item by item (async handlers, no `views/` writes, pinned
      version, `Utils.paths.userData` for data, Edit accelerators present).
- [ ] Grep guardrails: no `electrobun/bun` or `node:*` import under `src/mainview/`; no sync `fs` in
      `src/bun/`; no RPC client reference outside `rpc.ts` + `services/`.
- [ ] `bun run type-check` + `bun run test` clean (a bare `tsc --noEmit` cannot pass here — SPEC
      §15.15); storybook only where CODE_STYLE §14 requires it.
- [ ] `bun run build:canary` → `electrobun run` on the built app; decide `bundleCEF` per OS.
- [ ] **Remove the SPEC §10.6 wedge diagnostics at MVP completion** (`HEARTBEAT=1` hash stream and
      `POKE=1` native poke). Added 2026-10-06 as provisional instrumentation for the `debug.md`
      investigation; the ruling was "permanent until MVP is complete", so their removal is this
      phase's job, not a leftover's. While they live, `debug.md` §0 is their recipe.
- [ ] **Give notes a way to be found on disk.** Measured 2026-10-06: the app's own author could not
      locate two freshly created notes. The data lives at
      `~/Library/Application Support/com.example.notes/<channel>/notebook/` — under a **hidden**
      `~/Library`, keyed by user *and* channel, with the filename being the **slug** of the title
      (lowercase, `[a-z0-9]` only), never the title as typed. Decide: a Reveal-in-Finder action (note
      row or status-bar path), or a documented location, or accept it explicitly.
- [ ] **Make `deleteNote` reachable, or drop it.** It is wired end to end (schema → handler →
      `services/notes.service.ts`) and **nothing in the renderer calls it** — §10.2 gives the notes
      list no context menu — yet this phase's own verification expects "deleting a note … produce[s]
      a visible message". One of the two statements has to give.
- [ ] **Give failure messages context.** A refused mutation currently renders the bare §9.1 string —
      the same day's session surfaced only `not found` when `+` aimed a draft at a folder that no
      longer existed. The message should name the thing that failed (id, folder, or action).
- [ ] **Decide what a draft does when its target folder vanishes** (it captures the selected folder
      when `+` is pressed; if that folder is gone, the create fails with the bare `not found` above,
      and because the selection went stale the list looks empty too).

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
