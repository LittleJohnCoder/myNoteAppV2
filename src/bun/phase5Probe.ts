import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { countDocument } from "../mainview/utils/documentCounts";
import { noteLocation } from "../mainview/utils/noteLocation";

/**
 * Phase 5's dev-only probe (todo.md's Phase 5 Verification, the half that needs a live window).
 *
 * `bun test` covers what is pure — the counts, the path, the title charset — and nothing else in
 * this phase is: the editor's document lives in `EditorState`, so the only way to read or drive it
 * is the handle `window.__notesEditor` (SPEC §10.1), and the only way to reach *that* is bun's
 * `evaluateJavascriptWithResponse` request (§15.22). Three consequences shape every check below:
 *
 *   - **A keystroke is driven through the view's own transaction API** (`view.dispatch({changes})`)
 *     rather than a DOM `InputEvent`, which CodeMirror does not reproduce faithfully. The claim
 *     under test in checks 2–5 is the *save path* — doc change → debounce → `saveNote` — and the
 *     dispatch exercises exactly that path (the same `updateListener` a real keypress fires).
 *   - **One script is one React step** (Phase 4's lesson): an action and the read of its result are
 *     two scripts, and anything trailing a timer is polled to a deadline rather than slept for.
 *   - **The disk is the oracle.** Checks 2–5, 8–11 assert the bytes in the file, not just the DOM.
 *
 * The fixture is the `Probe5` folder, namespaced like Phase 4's (`Probe*`) and removed in `finally`
 * — including the notes the UI itself creates, so the notebook is left exactly as it was found. A
 * single `FAIL` line means the phase's acceptance is not met.
 */

export type EvaluateScript = (script: string) => Promise<unknown>;

export interface Phase5ProbeContext {
  dir: string;
  evaluate: EvaluateScript;
  /** Out-of-band disk changes (the seeds) need the app's own re-read trigger (SPEC §9.1). */
  pushNoteChanged: (id: string, updatedAt: number) => void;
}

const FOLDER = "Probe5";
const ALPHA = `${FOLDER}/alpha.md`;
const BETA = `${FOLDER}/beta.md`;
const GAMMA = `${FOLDER}/gamma.md`;

const ALPHA_BODY = "# Alpha\nfirst line of alpha\nsecond line";
const BETA_BODY = "# Beta\nbeta body text";
const GAMMA_BODY = "# Gamma\ngamma body";

const SEED: Array<{ relative: string; body: string }> = [
  { relative: ALPHA, body: ALPHA_BODY },
  { relative: BETA, body: BETA_BODY },
  { relative: GAMMA, body: GAMMA_BODY },
];

const TYPED_LINE = "probe-typed-line";
const BLUR_LINE = "probe-blur-line";
const DEBOUNCE_LINE = "probe-debounce-line";
const SWITCH_LINE = "probe-switch-line";
const DRAFT_BODY = "hello from the draft body";

/** Only ever to give React a turn; every wait that has an observable end is polled, not slept. */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const quote = (value: string): string => JSON.stringify(value);

/** What a view script reports about the pane — the shape every check reads. */
interface EditorState {
  noteId: string | null;
  dirty: boolean;
  draft: boolean;
  hasEditor: boolean;
  doc: string | null;
  title: string | null;
  titleReadOnly: boolean | null;
  focusedId: string | null;
  words: string | null;
  lines: string | null;
  location: string | null;
  rowIds: string[];
  activeRowId: string | null;
  error: string | null;
  uptimeMs: number;
  href: string;
}

/* ── view-side scripts ────────────────────────────────────────────────────────────────────────
   Each runs through `new Function(script)` and must `return` its own value. */

/**
 * The pane's whole observable state in one read: the data attributes, the live document through the
 * dev handle, the title field, the focused element and the status bar's raw counts. Note rows are
 * read from `#notes-list` — `#editor-pane` also carries `data-note-id`, so an unscoped
 * `[data-note-id]` query would now match the pane and every row must be asked for by scope.
 */
const SCRIPT_EDITOR_STATE = `
  const pane = document.querySelector("#editor-pane");
  const editor = window.__notesEditor;
  const bar = document.querySelector("#status-bar");
  const title = document.querySelector("#title-input");
  const active = document.activeElement;
  const noteIdAttr = pane?.getAttribute("data-note-id") ?? "";
  return {
    noteId: noteIdAttr === "" ? null : noteIdAttr,
    dirty: pane?.getAttribute("data-dirty") === "true",
    draft: pane?.getAttribute("data-draft") === "true",
    hasEditor: Boolean(editor && typeof editor.state?.doc?.toString === "function"),
    doc: editor ? editor.state.doc.toString() : null,
    title: title ? title.value : null,
    titleReadOnly: title ? title.readOnly : null,
    focusedId: active ? (active.id || active.className || active.tagName) : null,
    words: bar?.getAttribute("data-words") ?? null,
    lines: bar?.getAttribute("data-lines") ?? null,
    location: bar?.getAttribute("data-location") ?? null,
    rowIds: Array.from(document.querySelectorAll("#notes-list [data-note-id]"))
      .map((row) => row.getAttribute("data-note-id")),
    activeRowId: document.querySelector("#notes-list .notes__row_active")?.getAttribute("data-note-id") ?? null,
    // The pane's own complaint, and the two vitals that tell a state change from a page that
    // reloaded underneath the check (uptimeMs restarts, href is the whole story with a hash).
    error: document.querySelector("#editor-error")?.textContent ?? null,
    uptimeMs: Math.round(performance.now()),
    href: location.href,
  };
`;

/**
 * A one-line window into the pane's DOM that does not depend on the dev handle: whether
 * CodeMirror mounted at all, and whether the handle exists — two failures that look identical from
 * bun but have different fixes.
 */
const SCRIPT_EDITOR_DIAGNOSTIC = `
  const editor = window.__notesEditor;
  const pane = document.querySelector("#editor-pane");
  const shell = document.querySelector("#shell");
  return {
    handle: typeof editor,
    handleIsNull: editor === null,
    docLength: editor ? editor.state.doc.length : null,
    cmEditors: document.querySelectorAll("#editor-pane .cm-editor").length,
    cmContent: document.querySelector("#editor-pane .cm-content")?.textContent ?? null,
    // Window vitals: a page that has lost its React tree (or silently reloaded) is indistinguishable
    // from a failed feature without these — uptimeMs resets on a reload, theme/rows only exist
    // while the shell is mounted, and readyState catches a page that is still booting.
    readyState: document.readyState,
    uptimeMs: Math.round(performance.now()),
    href: location.href,
    bodyChildren: document.body.children.length,
    theme: document.documentElement.getAttribute("data-theme"),
    rows: document.querySelectorAll("#notes-list [data-note-id]").length,
    // What the shell itself believes: scope, selection and the query that filters the list.
    selectedFolder: shell?.getAttribute("data-selected-folder") ?? null,
    selectedNote: shell?.getAttribute("data-selected-note") ?? null,
    search: document.querySelector("#search-input")?.value ?? null,
    folders: Array.from(document.querySelectorAll("button[data-folder-path]"))
      .map((button) => button.getAttribute("data-folder-path")),
  };
`;

const scriptClick = (selector: string): string => `
  const element = document.querySelector(${quote(selector)});
  if (!element) return false;
  element.click();
  return true;
`;

/** Sets the title the way a user would, so React's onChange fires (its value tracker is bypassed). */
const scriptTypeTitle = (value: string): string => `
  const input = document.querySelector("#title-input");
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, ${quote(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
`;

const scriptPressKey = (selector: string, key: string): string => `
  const element = document.querySelector(${quote(selector)});
  if (!element) return false;
  element.dispatchEvent(new KeyboardEvent("keydown", { key: ${quote(key)}, bubbles: true }));
  return true;
`;

/**
 * Replaces the editor's document through the view's own transaction API — the save path is what
 * checks 2–5 measure, and `updateListener` cannot tell this apart from typing.
 */
const scriptSetDocument = (text: string): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: ${quote(text)} } });
  return editor.state.doc.toString();
`;

/** Blurs the editor by moving focus somewhere real, which is what a user's click does. */
const scriptBlurEditor = (): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  editor.focus();
  const other = document.querySelector("#search-input") ?? document.body;
  other.focus();
  return document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "none";
`;

/* ── the probe ─────────────────────────────────────────────────────────────────────────────── */

export const runPhase5Probe = async ({
  dir,
  evaluate,
  pushNoteChanged,
}: Phase5ProbeContext): Promise<void> => {
  const read = async (script: string): Promise<unknown> => {
    try {
      return await withDeadline(script);
    } catch (error) {
      return `threw ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /**
   * Reads that only observe are retried once. The view's channel has been measured to go quiet for a
   * stretch (lessons.md: the socket stops carrying messages without a crash or a navigation), and a
   * single retry separates "the page is slow" from "the channel is gone" without risking a second
   * edit — which is why actions keep using `read` and are never retried (`+` twice is two drafts,
   * Enter twice is two files).
   */
  const readState = async (script: string): Promise<unknown> => {
    try {
      return await withDeadline(script);
    } catch {
      await sleep(1_000);
      try {
        return await withDeadline(script);
      } catch (error) {
        return `threw ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };

  /**
   * Every request gets its own deadline. Electrobun's own `maxRequestTime` is not enough: when the
   * channel wedges (first measured here — a push sent from inside a request handler), a request can
   * hang for good, and an unguarded `await` would take the whole probe — and its `finally`, and so
   * the fixture cleanup — down with it.
   */
  const withDeadline = async (script: string): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const guard = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("the view did not answer within 8s — the channel is wedged")),
        8_000,
      );
    });
    try {
      return await Promise.race([evaluate(script), guard]);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  /** Opens a note by clicking its row and waits for the editor to bind to it (§10.1). */
  const openInPane = async (relative: string): Promise<EditorState> => {
    await read(scriptClick(`#notes-list [data-note-id='${relative}']`));
    return readEditorEventually((state) => state.noteId === relative && state.doc !== null);
  };

  const readEditor = async (): Promise<EditorState> => {
    const state = (await readState(SCRIPT_EDITOR_STATE)) as EditorState | string;
    if (typeof state === "string") {
      // A read that failed: the view is gone or wedged, so report "nothing observed" rather than
      // making a check pass on a stale guess — `error` carries the failure for the log.
      return {
        noteId: null,
        dirty: false,
        draft: false,
        hasEditor: false,
        doc: null,
        title: null,
        titleReadOnly: null,
        focusedId: null,
        words: null,
        lines: null,
        location: null,
        rowIds: [],
        activeRowId: null,
        error: state,
        uptimeMs: -1,
        href: "",
      };
    }
    return state;
  };

  /** Waits for the view to catch up with something asynchronous — a load, a push, a debounce. */
  const readEditorEventually = async (
    matches: (state: EditorState) => boolean,
    deadlineMs = 8_000,
  ): Promise<EditorState> => {
    const deadline = Date.now() + deadlineMs;
    let state = await readEditor();
    while (!matches(state) && Date.now() < deadline) {
      // 250ms, not 100: the poll is the probe's whole traffic budget, and the transport has been
      // measured to stop carrying messages on a long, chatty run (lessons.md).
      await sleep(250);
      state = await readEditor();
    }
    return state;
  };

  const fileText = async (relative: string): Promise<string | null> => {
    try {
      return await readFile(join(dir, relative), "utf8");
    } catch {
      return null;
    }
  };

  const mtime = async (relative: string): Promise<number | null> => {
    try {
      return (await stat(join(dir, relative))).mtimeMs;
    } catch {
      return null;
    }
  };

  const listFolder = async (): Promise<string[]> => {
    try {
      return (await readdir(join(dir, FOLDER))).sort();
    } catch {
      return [];
    }
  };

  let failures = 0;

  /**
   * The transport has been measured to stop carrying messages part-way through a long run, and both
   * events so far landed around checks 9–10 (lessons.md). `PROBE5_PART=1` runs checks 1–6 — mount,
   * open, saves, status bar — and `=2` runs 7–11: drafts, title commit, collision, body save, files.
   * Unset runs all eleven, which is the shape a single clean run has to have.
   */
  const part = Number(process.env.PROBE5_PART ?? 0);
  const partRuns = (n: number): boolean => part === 0 || (part === 1 ? n <= 6 : n >= 7);

  const check = async (
    n: number,
    run: () => Promise<{ ok: boolean; observed: string; expected?: string }>,
  ): Promise<void> => {
    if (!partRuns(n)) {
      console.log(`[probe5] ${n} skipped — PROBE5_PART=${part}`);
      return;
    }
    try {
      const result = await run();
      if (!result.ok) failures += 1;
      if (result.ok) console.log(`[probe5] ${n} ok — ${result.observed}`);
      else {
        // A failing check is worth one more request: the window's vitals say whether the feature
        // failed or the whole tree went away, which changes the fix entirely.
        const vitals = await readState(SCRIPT_EDITOR_DIAGNOSTIC);
        console.log(
          `[probe5] ${n} FAIL — expected ${result.expected ?? "?"}, saw ${result.observed}`,
        );
        console.log(`[probe5] ${n} vitals — ${JSON.stringify(vitals)}`);
      }
    } catch (error) {
      failures += 1;
      console.log(
        `[probe5] ${n} FAIL — threw ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  console.log("[probe5] Phase 5 checks — mount, open, save, drafts, title commit, status bar");
  console.log(`[probe5] diag — ${JSON.stringify(await readState(SCRIPT_EDITOR_DIAGNOSTIC))}`);

  try {
    // A crashed run would leave the fixture behind; both the seeds and the UI-created notes live in
    // `FOLDER`, so one removal is the whole reset.
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    for (const entry of SEED) {
      const absolute = join(dir, entry.relative);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, entry.body, "utf8");
    }

    const seededMtimes = new Map<string, number | null>();
    for (const entry of SEED) seededMtimes.set(entry.relative, await mtime(entry.relative));

    // The seeds are out-of-band writes, so the app has to *prove* it knows about them before any
    // check runs, and it has to be looking at an unfiltered list to do that. Two traps here, both
    // measured: the push can be processed before the seeds are on disk (hence the retry), and Phase 4
    // leaves a **stale** folder selected — it removes its own fixture after the fact — so a scoped
    // list would hide the new folder no matter how long a check waited.
    pushNoteChanged(ALPHA, Date.now());
    await read(scriptClick("#all-notes"));
    let listed = await readEditorEventually((state) => state.rowIds.includes(ALPHA), 8_000);
    if (!listed.rowIds.includes(ALPHA)) {
      pushNoteChanged(ALPHA, Date.now());
      listed = await readEditorEventually((state) => state.rowIds.includes(ALPHA), 8_000);
    }

    // Select the fixture folder so the list holds exactly the probe's notes.
    await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
    const scoped = await readEditorEventually((state) => state.rowIds.includes(ALPHA), 8_000);
    console.log(`[probe5] diag — after folder click ${JSON.stringify(scoped)}`);
    console.log(`[probe5] diag — ${JSON.stringify(await readState(SCRIPT_EDITOR_DIAGNOSTIC))}`);

    // 1 — opening each of the three seeded notes shows *that* note's body, and touches no file.
    await check(1, async () => {
      const seen: string[] = [];
      for (const entry of SEED) {
        await read(scriptClick(`#notes-list [data-note-id='${entry.relative}']`));
        const state = await readEditorEventually(
          (candidate) => candidate.noteId === entry.relative && candidate.doc === entry.body,
        );
        seen.push(`${entry.relative}:${state.doc === entry.body}`);
      }
      const unchanged: string[] = [];
      for (const entry of SEED) {
        const sameContent = (await fileText(entry.relative)) === entry.body;
        const sameMtime = (await mtime(entry.relative)) === seededMtimes.get(entry.relative);
        unchanged.push(`${entry.relative}:${sameContent && sameMtime}`);
      }
      const ok = seen.every((entry) => entry.endsWith("true")) && unchanged.every((entry) => entry.endsWith("true"));
      return {
        ok,
        observed: `documents=${JSON.stringify(seen)} files-untouched=${JSON.stringify(unchanged)}`,
        expected: "each note's own body is loaded, and no file was written by opening it",
      };
    });

    // 2 — typing then waiting past the debounce writes the text to the `.md` (§9.1's 500 ms).
    await check(2, async () => {
      // Check 1 left the pane on gamma: a check drives the note it is about, or it is measuring the
      // wrong file (this is exactly how check 2 failed the first time — the text landed in gamma.md).
      const opened = await openInPane(ALPHA);
      const target = `${ALPHA_BODY}\n${TYPED_LINE}`;
      const started = Date.now();
      await read(scriptSetDocument(target));
      let text = await fileText(ALPHA);
      const deadline = Date.now() + 5_000;
      while ((text ?? "").indexOf(TYPED_LINE) === -1 && Date.now() < deadline) {
        await sleep(100);
        text = await fileText(ALPHA);
      }
      const elapsed = Date.now() - started;
      const betaUntouched = (await fileText(BETA)) === BETA_BODY;
      const docHeld = (await readEditor()).doc === target;
      const ok =
        (text ?? "").indexOf(TYPED_LINE) !== -1 &&
        betaUntouched &&
        docHeld &&
        opened.doc === ALPHA_BODY;
      return {
        ok,
        observed: `opened=${JSON.stringify(opened.noteId)} file=${JSON.stringify(text)} after=${elapsed}ms debounce=500ms beta-untouched=${betaUntouched}`,
        expected: `alpha.md holds ${JSON.stringify(TYPED_LINE)} and no other note's file changed`,
      };
    });

    // 3 — blur saves immediately: no waiting out the debounce. The elapsed time is part of the
    // evidence, so it is printed — a save that only lands after 500 ms would be the timer, not blur.
    await check(3, async () => {
      await openInPane(ALPHA);
      const target = `${ALPHA_BODY}\n${TYPED_LINE}\n${BLUR_LINE}`;
      const started = Date.now();
      await read(scriptSetDocument(target));
      await read(scriptBlurEditor());
      let text = await fileText(ALPHA);
      const deadline = Date.now() + 400;
      while ((text ?? "").indexOf(BLUR_LINE) === -1 && Date.now() < deadline) {
        await sleep(50);
        text = await fileText(ALPHA);
      }
      const elapsed = Date.now() - started;
      const ok = (text ?? "").indexOf(BLUR_LINE) !== -1 && elapsed < 500;
      return {
        ok,
        observed: `blur-saved-after=${elapsed}ms contains-blur-line=${(text ?? "").indexOf(BLUR_LINE) !== -1}`,
        expected: "the file holds the line well before the 500 ms debounce would have fired",
      };
    });

    // 4 — the completed wait reaches the disk (the half that is automated; losing the last edit by
    // quitting *inside* the window is accepted by §9.1, and the quit/relaunch is manual).
    await check(4, async () => {
      await openInPane(ALPHA);
      const target = `${ALPHA_BODY}\n${TYPED_LINE}\n${BLUR_LINE}\n${DEBOUNCE_LINE}`;
      await read(scriptSetDocument(target));
      await sleep(700);
      const text = await fileText(ALPHA);
      const ok = text === target;
      return {
        ok,
        observed: `file=${JSON.stringify(text)}`,
        expected: `the file holds all four lines, byte for byte`,
      };
    });

    // 5 — switching notes while a save is pending leaves both files correct (§9.1's flush).
    await check(5, async () => {
      await openInPane(ALPHA);
      const target = `${ALPHA_BODY}\n${TYPED_LINE}\n${BLUR_LINE}\n${DEBOUNCE_LINE}\n${SWITCH_LINE}`;
      await read(scriptSetDocument(target));
      await read(scriptClick(`#notes-list [data-note-id='${BETA}']`));
      const state = await readEditorEventually(
        (candidate) => candidate.noteId === BETA && candidate.doc === BETA_BODY,
      );
      const alpha = await fileText(ALPHA);
      const beta = await fileText(BETA);
      const ok =
        alpha === target && beta === BETA_BODY && state.doc === BETA_BODY && state.dirty === false;
      return {
        ok,
        observed: `alpha-has-switch-line=${(alpha ?? "").indexOf(SWITCH_LINE) !== -1} beta=${JSON.stringify(beta)} pane-shows-beta=${state.doc === BETA_BODY} dirty=${state.dirty}`,
        expected: "the pending save landed on alpha.md, beta.md is untouched, and the pane is clean",
      };
    });

    // 6 — counts and path come from the live document; a draft (no note open) returns to `—`.
    await check(6, async () => {
      const loaded = await openInPane(ALPHA);
      const expected = countDocument(loaded.doc ?? "");
      const shown = `${loaded.words}/${loaded.lines}/${loaded.location}`;
      const expectedShown = `${expected.words}/${expected.lines}/${noteLocation(ALPHA)}`;

      // Track an edit without a save: the counts must follow the document, not the file.
      const longer = `${ALPHA_BODY}\n${TYPED_LINE}\n${BLUR_LINE}\n${DEBOUNCE_LINE}\n${SWITCH_LINE}\nextra`;
      await read(scriptSetDocument(longer));
      const afterEdit = await readEditorEventually(
        (candidate) => candidate.words === String(countDocument(longer).words),
      );

      // `+` starts a draft: nothing is open, so every field is back to `—` (§10.3).
      await read(scriptClick("#new-note"));
      const drafting = await readEditorEventually((candidate) => candidate.draft === true);
      const empty = `${drafting.words}/${drafting.lines}/${drafting.location}`;

      // Abandon the draft the way a user would — selecting a note (§10.5) — and leave nothing behind.
      await read(scriptClick(`#notes-list [data-note-id='${ALPHA}']`));
      await readEditorEventually((candidate) => candidate.draft === false);

      const ok =
        shown === expectedShown &&
        afterEdit.words === String(countDocument(longer).words) &&
        afterEdit.lines === String(countDocument(longer).lines) &&
        empty === "—/—/—";
      return {
        ok,
        observed: `on-open=${shown} expected=${expectedShown} after-edit-words=${afterEdit.words} draft=${empty}`,
        expected: `counts and path track the live document (${expectedShown}), and a draft shows —/—/—`,
      };
    });

    // 7 — `+` focuses the title field, and Tab with an empty title only moves the caret: no file.
    await check(7, async () => {
      await read(scriptClick("#new-note"));
      const drafting = await readEditorEventually(
        (candidate) => candidate.draft === true && candidate.focusedId === "title-input",
      );
      const before = await listFolder();
      await read(scriptPressKey("#title-input", "Tab"));
      const moved = await readEditorEventually((candidate) => candidate.focusedId !== "title-input");
      await sleep(700); // a file would be on disk by now if one were coming
      const after = await listFolder();
      const ok =
        drafting.focusedId === "title-input" &&
        drafting.noteId === null &&
        JSON.stringify(before) === JSON.stringify(after) &&
        moved.focusedId !== "title-input";
      return {
        ok,
        observed: `focus-after-plus=${drafting.focusedId} note-id=${JSON.stringify(drafting.noteId)} focus-after-tab=${moved.focusedId} folder=${JSON.stringify(after)}`,
        expected: "the title field takes focus, Tab reaches the body, and the folder gained no file",
      };
    });

    // 8 — a committed title creates the named note, selects its row and binds the editor to the id
    // the layer returned (not to the name that was typed).
    await check(8, async () => {
      const id = `${FOLDER}/probeplan.md`;
      await read(scriptClick("#title-input"));
      await read(scriptTypeTitle("ProbePlan"));
      await read(scriptPressKey("#title-input", "Enter"));
      const state = await readEditorEventually((candidate) => candidate.noteId === id);
      const onDisk = (await fileText(id)) === "";
      const listed = await readEditorEventually((candidate) => candidate.rowIds.includes(id));
      const ok =
        state.noteId === id && onDisk && listed.rowIds.includes(id) && state.activeRowId === id;
      return {
        ok,
        observed: `note-id=${JSON.stringify(state.noteId)} title=${JSON.stringify(state.title)} file-empty=${onDisk} listed=${listed.rowIds.includes(id)} active-row=${JSON.stringify(listed.activeRowId)}`,
        expected: `committing "ProbePlan" creates ${id}, lists it, selects it and binds the editor`,
      };
    });

    // 9 — a colliding title is visible: `ProbePlan` again yields `probeplan1.md`, and the pane binds
    // to the returned id (SPEC §10.5) rather than to the name the user typed.
    await check(9, async () => {
      const id = `${FOLDER}/probeplan1.md`;
      await read(scriptClick("#new-note"));
      await readEditorEventually((candidate) => candidate.draft === true);
      await read(scriptClick("#title-input"));
      await read(scriptTypeTitle("ProbePlan"));
      await read(scriptPressKey("#title-input", "Enter"));
      const state = await readEditorEventually((candidate) => candidate.noteId === id);
      const listed = await readEditorEventually((candidate) => candidate.rowIds.includes(id));
      const firstStillThere = (await fileText(`${FOLDER}/probeplan.md`)) === "";
      const ok =
        state.noteId === id &&
        listed.rowIds.includes(id) &&
        state.activeRowId === id &&
        firstStillThere;
      return {
        ok,
        observed: `note-id=${JSON.stringify(state.noteId)} listed=${listed.rowIds.includes(id)} active-row=${JSON.stringify(listed.activeRowId)} first-note-intact=${firstStillThere}`,
        expected: `the collision produces ${id}, and ${FOLDER}/probeplan.md is untouched`,
      };
    });

    // 10 — `+`, Tab straight into the body, type: the note materialises as `untitled` (its name is
    // the layer's business) and the file holds exactly the body — no title line (§9.1, §10.5).
    await check(10, async () => {
      await read(scriptClick("#new-note"));
      await readEditorEventually((candidate) => candidate.draft === true);
      await read(scriptPressKey("#title-input", "Tab"));
      await read(scriptSetDocument(DRAFT_BODY));
      const state = await readEditorEventually(
        (candidate) => candidate.noteId !== null && /^Probe5\/untitled\d*\.md$/.test(candidate.noteId),
      );
      const id = state.noteId ?? "";
      const text = await fileText(id);
      const listed = await readEditorEventually((candidate) => candidate.rowIds.includes(id));
      const ok = text === DRAFT_BODY && listed.rowIds.includes(id) && state.doc === DRAFT_BODY;
      return {
        ok,
        observed: `note-id=${JSON.stringify(id)} file=${JSON.stringify(text)} listed=${listed.rowIds.includes(id)} title=${JSON.stringify(state.title)}`,
        expected: `the draft body is written to ${FOLDER}/untitled*.md with no title line`,
      };
    });

    // 11 — read the files directly: the title never appears in one, whether it was committed (the
    // file is empty — the title *is* the filename) or skipped (the file is the body alone).
    await check(11, async () => {
      const state = await readEditor();
      // Read whatever the draft actually became: the collision rule may have named it `untitled1.md`.
      const titled = await fileText(`${FOLDER}/probeplan.md`);
      const body = state.noteId === null ? null : await fileText(state.noteId);
      const named = state.noteId !== null && /^Probe5\/untitled\d*\.md$/.test(state.noteId);
      const ok = titled === "" && named && body === DRAFT_BODY && state.doc === DRAFT_BODY;
      return {
        ok,
        observed: `probeplan.md=${JSON.stringify(titled)} body-file=${JSON.stringify(state.noteId)} content=${JSON.stringify(body)} pane=${JSON.stringify(state.doc)}`,
        expected: "no `.md` file contains a title line — the title is the filename and nothing more",
      };
    });
  } finally {
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    // Removing the fixture is another out-of-band disk change: the app's push is the only thing that
    // makes it re-read (§9.1). The payload is ignored by the view — a refresh is all it asks for.
    pushNoteChanged("", Date.now());

    const leftovers = await listFolder();
    console.log(
      `[probe5] done — ${failures} failure(s); fixture removed${leftovers.length > 0 ? ` (leftovers: ${JSON.stringify(leftovers)})` : ""}`,
    );
  }
};
