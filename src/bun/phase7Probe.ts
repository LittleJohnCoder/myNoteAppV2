import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PREVIEW_MODE_ACTION, TOOLBAR_ACTIONS } from "../mainview/components/Toolbar/Toolbar.constants";

/**
 * Phase 7's dev-only probe (todo.md's Phase 7 Verification): the toolbar's 18 document actions and
 * the preview-mode switch.
 *
 * **The ids are not retyped here.** They come from `Toolbar.constants.ts` — the same list the
 * component renders — so the sweep cannot drift from the toolbar, and a button that the probe
 * cannot find is reported as `missing` rather than silently skipped. Two package facts decide the
 * shape, both read from the installed source rather than guessed:
 *
 *   - **Every payload is the package's own** (`lib/extensions/actions.js`): `codeBlock` inserts a
 *     `javascript` sample, `table` a 3-column sample, `diagram` a `flowchart LR` sample, `link` and
 *     `image` example URLs (`https://example.com`, `https://placehold.co/400x200`). The checks
 *     assert those strings, so a package upgrade that changes them fails here.
 *   - **Two buttons are not package actions**: `math` (inserted by hand, in the **block** form — a
 *     one-line `$$…$$` is not a math block, §10.6) and `preview-mode` (the view's own mode, §10.1).
 *
 * Harness rules inherited from the earlier probes, and the reason each is here: one script is one
 * React step (`data-mode` needs a commit, the document does not — the sweep reads the document, so
 * it can drive all 18 buttons in one script); a synthetic `click()` does **not** blur the editor, so
 * a pending save is waited for by polling the file (measured at ~780 ms) rather than read
 * immediately; and every poll waits for the *expected* value, never for "something changed".
 *
 * **Check numbering follows todo.md's 14 lines**, with a label per reading where one line covers
 * several actions: `1a`–`1d` are line 1's four wrap actions, `7a`/`7b` line 7's two code-block
 * cases, `8a`–`8c` line 8's three inserts.
 *
 * **Line 13 has a run precondition.** "With no note and no draft open every button is `disabled`"
 * is a state this app only has at **boot** — the MVP has no way to close a note (selecting one is
 * one-way, and `+` starts a draft, which counts as a document). So the probe reads it *before*
 * opening anything, and when a document is already open (a full-suite run, where phases 4–6 have
 * left one) it prints a loud `precondition` line naming the run that does verify it instead of
 * reporting a pass it did not measure. Counted separately from `FAIL` in the `done` line.
 *
 * Fixture: `Probe7/`, namespaced like its predecessors and removed in `finally`.
 */

export type EvaluateScript = (script: string) => Promise<unknown>;

export interface Phase7ProbeContext {
  dir: string;
  evaluate: EvaluateScript;
  /** Out-of-band disk changes (the seeds) need the app's own re-read trigger (SPEC §9.1). */
  pushNoteChanged: (id: string, updatedAt: number) => void;
}

const FOLDER = "Probe7";

const TOOLBAR_NOTE = `${FOLDER}/toolbar.md`;
const MODE_NOTE = `${FOLDER}/mode.md`;

/** Line 9's control: the same math block, phase 6's bytes, opened from disk. */
const MATH_SEEDED = `${FOLDER}/math-phase6.md`;

const TOOLBAR_BODY = ["# Toolbar", "", "seed line", ""].join("\n");
const MODE_BODY = ["# Mode", "", "rendered line", ""].join("\n");

/** Phase 6's own math fixture, byte for byte — the block that was measured to render. */
const MATH_SEEDED_BODY = ["# Math", "", "$$", "e^{i\\pi}+1=0", "$$", ""].join("\n");

const SEED: Array<{ relative: string; body: string }> = [
  { relative: TOOLBAR_NOTE, body: TOOLBAR_BODY },
  { relative: MODE_NOTE, body: MODE_BODY },
  { relative: MATH_SEEDED, body: MATH_SEEDED_BODY },
];

/** The package's own payloads, copied from `lib/extensions/actions.js` — checks assert these bytes. */
const CODE_BLOCK_SAMPLE = [
  "```javascript",
  "function hello() {",
  '  alert("hello world");',
  "}",
  "hello();",
  "```",
].join("\n");

const TABLE_SAMPLE = [
  "| Column 1 | Column 2 | Column 3 |",
  "|----------|----------|----------|",
  "| Cell 1   | Cell 2   | Cell 3   |",
  "| Cell 4   | Cell 5   | Cell 6   |",
].join("\n");

const DIAGRAM_SAMPLE = [
  "```mermaid",
  "flowchart LR",
  "    A[Start] --> B[Process]",
  "    B --> C{Decision}",
  "    C -->|Yes| D[Result 1]",
  "    C -->|No| E[Result 2]",
  "```",
].join("\n");

/** The four wrap actions of line 1, with the package's markers (`lib/extensions/actions.js`). */
const WRAP_ACTIONS = [
  { id: "bold", marker: "**", label: "1a" },
  { id: "italic", marker: "_", label: "1b" },
  { id: "strikethrough", marker: "~~", label: "1c" },
  { id: "inlineCode", marker: "`", label: "1d" },
] as const;

/** Line 10's sweep: every button that writes to the document, in the toolbar's own order. */
const DOCUMENT_ACTION_IDS = TOOLBAR_ACTIONS.filter((action) => action.id !== PREVIEW_MODE_ACTION).map(
  (action) => action.id,
);

/** Line 13 clicks *every* button, the preview-mode one included. */
const ALL_ACTION_IDS = TOOLBAR_ACTIONS.map((action) => action.id);

/** A line that appears more than once is a duplicated prefix — what line 10 exists to catch. */
const SWEEP_LINES: Array<{ line: string; count: number }> = [
  { line: "****", count: 1 },
  { line: "__", count: 1 },
  { line: "~~~~", count: 1 },
  { line: "# ", count: 1 },
  { line: "## ", count: 1 },
  { line: "### ", count: 1 },
  { line: "- ", count: 1 },
  { line: "1. ", count: 1 },
  { line: "- [ ] ", count: 1 },
  { line: "> ", count: 1 },
  { line: "``", count: 1 },
  { line: "---", count: 1 },
  { line: "$$", count: 2 },
  { line: "```", count: 2 },
  { line: "```javascript", count: 1 },
  { line: "```mermaid", count: 1 },
  { line: "flowchart LR", count: 1 },
  { line: "[link text](https://example.com)", count: 1 },
  { line: "![alt text](https://placehold.co/400x200)", count: 1 },
  { line: "| Column 1 | Column 2 | Column 3 |", count: 1 },
  { line: "|----------|----------|----------|", count: 1 },
  { line: "| Cell 4   | Cell 5   | Cell 6   |", count: 1 },
  { line: "function hello() {", count: 1 },
];

/**
 * Every line the sweep's document may contain: the single-line constructs, the sample payloads, and
 * blank lines (the block actions leave separators behind). Anything else is a line no action was
 * supposed to produce — the reading that catches a leaked construct the per-marker counts miss.
 */
const SWEEP_ALLOWED: readonly string[] = [
  "",
  " ",
  "****",
  "__",
  "~~~~",
  "# ",
  "## ",
  "### ",
  "- ",
  "1. ",
  "- [ ] ",
  "> ",
  "``",
  "---",
  "$$",
  "```",
  "```javascript",
  "[link text](https://example.com)",
  "![alt text](https://placehold.co/400x200)",
  ...CODE_BLOCK_SAMPLE.split("\n"),
  ...TABLE_SAMPLE.split("\n"),
  ...DIAGRAM_SAMPLE.split("\n"),
];

/** The shapes a doubled prefix would take: `# #`, `- -`, `> >`, `1. 1.`, `- [ ] -`. */
const DUPLICATED_PREFIXES = [/^#+\s+#/, /^[-*+]\s+[-*+]/, /^>\s+>/, /^\d+\.\s+\d+\./, /^[-*+]\s+\[[ xX]\]\s*[-*+]/];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const quote = (value: string): string => JSON.stringify(value);

const actionSelector = (id: string): string => `#toolbar [data-action="${id}"]`;

/** One button's part of the toolbar contract (§10.6). */
interface ButtonState {
  id: string | null;
  disabled: boolean;
}

/** Everything Phase 7 asserts, in one read. `-1`/`null` mean "not observed". */
interface ViewState {
  noteId: string | null;
  draft: boolean;
  dirty: boolean;
  /** §10.6: `"true"` exactly when a note or a draft is open. */
  bodyVisible: boolean;
  doc: string | null;
  selection: { from: number; to: number; text: string } | null;
  caretLineText: string | null;
  caretAtLineStart: boolean;
  toolbarId: string | null;
  toolbarRole: string | null;
  actions: ButtonState[];
  mode: string | null;
  ariaPressed: string | null;
  /** `.cm-markdown-preview` — rendered markdown; zero in raw mode (§10.1). */
  renderedBlocks: number;
  mathPreview: number;
  katexInMath: number;
  error: string | null;
  uptimeMs: number;
}

/** The rendered surface line by line — what a check reads when a widget it expects is not there. */
interface ContentDiagnostic {
  hasFocus: boolean | null;
  lineClasses: string[];
  hiddenLines: number;
  mathBlockLines: number;
  mathPreview: number;
  markdownPreview: number;
  relevantClasses: string[];
}

/* ── view-side scripts ────────────────────────────────────────────────────────────────────────
   Each runs through `new Function(script)` on the view's task and must `return` its own value. */

const SCRIPT_STATE = `
  const pane = document.querySelector("#editor-pane");
  const editor = window.__notesEditor;
  const toolbar = document.querySelector("#toolbar");
  const modeButton = document.querySelector('#toolbar [data-action="preview-mode"]');
  const content = document.querySelector("#editor-pane .cm-content");
  const selection = editor ? editor.state.selection.main : null;
  const count = (selector) => (content ? content.querySelectorAll(selector).length : -1);
  return {
    noteId: (pane ? pane.getAttribute("data-note-id") : "") || null,
    draft: pane ? pane.getAttribute("data-draft") === "true" : false,
    dirty: pane ? pane.getAttribute("data-dirty") === "true" : false,
    bodyVisible: pane ? pane.getAttribute("data-body-visible") === "true" : false,
    doc: editor ? editor.state.doc.toString() : null,
    selection: editor && selection
      ? {
          from: selection.from,
          to: selection.to,
          text: editor.state.sliceDoc(selection.from, selection.to),
        }
      : null,
    caretLineText: editor && selection ? editor.state.doc.lineAt(selection.from).text : null,
    caretAtLineStart: editor && selection ? editor.state.doc.lineAt(selection.from).from === selection.from : false,
    toolbarId: toolbar ? toolbar.id : null,
    toolbarRole: toolbar ? toolbar.getAttribute("role") : null,
    actions: Array.from(document.querySelectorAll("#toolbar [data-action]")).map((button) => ({
      id: button.getAttribute("data-action"),
      disabled: button.disabled,
    })),
    mode: modeButton ? modeButton.getAttribute("data-mode") : null,
    ariaPressed: modeButton ? modeButton.getAttribute("aria-pressed") : null,
    renderedBlocks: count(".cm-markdown-preview"),
    mathPreview: count(".cm-math-preview"),
    katexInMath: count(".cm-math-preview .katex"),
    error: document.querySelector("#editor-error")?.textContent ?? null,
    uptimeMs: Math.round(performance.now()),
  };
`;

const scriptClick = (selector: string): string => `
  const element = document.querySelector(${quote(selector)});
  if (!element) return false;
  element.click();
  return true;
`;

const scriptClickAction = (id: string): string => scriptClick(actionSelector(id));

/**
 * Replaces the document and the selection in one transaction — the coordinate space of `selection`
 * is the document *after* the change (what a toolbar action then acts on).
 */
const scriptSetDocument = (text: string, from: number, to: number): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: ${quote(text)} },
    selection: { anchor: ${from}, head: ${to} },
  });
  return editor.state.doc.toString();
`;

const scriptSetCaret = (lineNumber: number): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  const line = editor.state.doc.line(Math.min(${lineNumber}, editor.state.doc.lines));
  editor.dispatch({ selection: { anchor: line.from } });
  return line.from;
`;

/** Typing at the caret — what the `math` check does on the blank line the action left for it. */
const scriptInsertText = (text: string): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  const { from, to } = editor.state.selection.main;
  editor.dispatch({ changes: { from: from, to: to, insert: ${quote(text)} } });
  return editor.state.doc.toString();
`;

/**
 * A real `keydown` on the editor's content DOM. Used by line 14 in a **pair**: a bare `Enter` proves
 * the harness delivers keystrokes to CodeMirror's keymap (so "⌘B did nothing" is a reading, not a
 * silent no-op), and the two modifier variants are the line under test.
 */
const scriptPressKey = (key: string, modifiers: { meta: boolean; ctrl: boolean }): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  const event = new KeyboardEvent("keydown", {
    key: ${quote(key)},
    bubbles: true,
    cancelable: true,
    metaKey: ${modifiers.meta},
    ctrlKey: ${modifiers.ctrl},
  });
  editor.contentDOM.dispatchEvent(event);
  return { prevented: event.defaultPrevented, doc: editor.state.doc.toString() };
`;

/**
 * The sweep of line 10: every document action, one after another, each from a **collapsed caret on
 * an empty line** of the same document — the insert path, not the wrap path. The document is read
 * synchronously in the same script, because a toolbar click writes it synchronously (nothing here
 * waits on a React commit, which is what a `data-*` reading would).
 */
const scriptSweepActions = (ids: readonly string[]): string => `
  const editor = window.__notesEditor;
  if (!editor) return { error: "no-editor", results: [], doc: null };
  const results = [];
  for (const id of ${JSON.stringify(ids)}) {
    const button = document.querySelector("#toolbar [data-action='" + id + "']");
    if (!button) {
      results.push({ id: id, missing: true, disabled: null, grew: false });
      continue;
    }
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });
    const before = editor.state.doc.toString();
    button.click();
    const after = editor.state.doc.toString();
    results.push({ id: id, missing: false, disabled: button.disabled, grew: after.length > before.length });
    if (!after.endsWith("\\n")) editor.dispatch({ changes: { from: after.length, insert: "\\n" } });
  }
  return { error: null, results: results, doc: editor.state.doc.toString() };
`;

/** Line 13: every button clicked while nothing is open — the document must not move. */
const scriptClickEveryAction = (ids: readonly string[]): string => `
  const editor = window.__notesEditor;
  const results = [];
  for (const id of ${JSON.stringify(ids)}) {
    const button = document.querySelector("#toolbar [data-action='" + id + "']");
    if (!button) {
      results.push({ id: id, missing: true, disabled: null, changed: false });
      continue;
    }
    const before = editor ? editor.state.doc.toString() : null;
    button.click();
    const after = editor ? editor.state.doc.toString() : null;
    results.push({ id: id, missing: false, disabled: button.disabled, changed: before !== after });
  }
  return { results: results, doc: editor ? editor.state.doc.toString() : null };
`;

/**
 * The rendered surface, line by line — what a check needs when a widget it expects is not there:
 * whether the block was detected at all (`.cm-hidden-line` / `.cm-math-block-line`), whether it was
 * skipped as unfinished, and whether the editor believes it is focused (the focused branch renders
 * the block raw instead of replacing it with a widget).
 */
const SCRIPT_CONTENT_DIAGNOSTIC = `
  const editor = window.__notesEditor;
  const content = document.querySelector("#editor-pane .cm-content");
  const lines = content ? Array.from(content.querySelectorAll(".cm-line")) : [];
  return {
    hasFocus: editor ? editor.hasFocus : null,
    lineCount: lines.length,
    lineClasses: lines.map((line) => String(line.className)),
    lineTexts: lines.map((line) => line.textContent),
    hiddenLines: content ? content.querySelectorAll(".cm-hidden-line").length : -1,
    mathBlockLines: content ? content.querySelectorAll(".cm-math-block-line").length : -1,
    mathPreview: content ? content.querySelectorAll(".cm-math-preview").length : -1,
    markdownPreview: content ? content.querySelectorAll(".cm-markdown-preview").length : -1,
    relevantClasses: content
      ? Array.from(content.querySelectorAll("[class*='cm-']"))
          .map((node) => String(node.className))
          .filter((name) => /cm-(math|hidden|markdown|collapsed|highlight)/.test(name))
      : [],
  };
`;

/* ── the probe ─────────────────────────────────────────────────────────────────────────────── */

export const runPhase7Probe = async ({
  dir,
  evaluate,
  pushNoteChanged,
}: Phase7ProbeContext): Promise<void> => {
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

  /** Actions are never retried: a retried click is a second edit (§9.1's rule for `+`). */
  const read = async (script: string): Promise<unknown> => {
    try {
      return await withDeadline(script);
    } catch (error) {
      return `threw ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /** Observations are retried once — the transport has been measured to go quiet for a stretch. */
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
   * A script's object result, or `null` when the read failed. A wedged view must land in a check's
   * `observed` as "not observed" — never as an exception that hides which check was running.
   */
  const readObject = async <T>(script: string): Promise<T | null> => {
    const result = await read(script);
    return typeof result === "object" && result !== null ? (result as T) : null;
  };

  const view = async (): Promise<ViewState> => {
    const state = (await readState(SCRIPT_STATE)) as ViewState | string;
    if (typeof state === "string") {
      // A failed read is reported as "nothing observed", never as a pass on a stale guess.
      return {
        noteId: null,
        draft: false,
        dirty: false,
        bodyVisible: false,
        doc: null,
        selection: null,
        caretLineText: null,
        caretAtLineStart: false,
        toolbarId: null,
        toolbarRole: null,
        actions: [],
        mode: null,
        ariaPressed: null,
        renderedBlocks: -1,
        mathPreview: -1,
        katexInMath: -1,
        error: state,
        uptimeMs: -1,
      };
    }
    return state;
  };

  /** Waits for the view to catch up — a load, a widget, a debounce, a React commit. */
  const viewEventually = async (
    matches: (state: ViewState) => boolean,
    deadlineMs = 8_000,
  ): Promise<ViewState> => {
    const deadline = Date.now() + deadlineMs;
    let state = await view();
    while (!matches(state) && Date.now() < deadline) {
      await sleep(250);
      state = await view();
    }
    return state;
  };

  /** Clicks an action and waits for the document it must produce. */
  const applyAction = async (id: string, expectedDoc: string, deadlineMs = 4_000): Promise<ViewState> => {
    await read(scriptClickAction(id));
    return viewEventually((state) => state.doc === expectedDoc, deadlineMs);
  };

  const openInPane = async (relative: string): Promise<ViewState> => {
    await read(scriptClick(`#notes-list [data-note-id='${relative}']`));
    return viewEventually((state) => state.noteId === relative && state.doc !== null);
  };

  const fileText = async (relative: string): Promise<string | null> => {
    try {
      return await readFile(join(dir, relative), "utf8");
    } catch {
      return null;
    }
  };

  /** The disk is the oracle for a write: poll the file rather than sleeping out the debounce. */
  const waitForFile = async (
    relative: string,
    matches: (text: string) => boolean,
    deadlineMs = 8_000,
  ): Promise<string | null> => {
    const deadline = Date.now() + deadlineMs;
    let text = await fileText(relative);
    while (text !== null && !matches(text) && Date.now() < deadline) {
      await sleep(150);
      text = await fileText(relative);
    }
    return text;
  };

  /** Every `.md` in the notebook — line 13's "the notebook gains no file" reading. */
  const listNotes = async (): Promise<string[]> => {
    try {
      const entries = await readdir(dir, { recursive: true });
      return entries.filter((entry) => entry.endsWith(".md")).sort();
    } catch {
      return [];
    }
  };

  let failures = 0;
  let preconditions = 0;

  const check = async (
    label: string,
    run: () => Promise<{ ok: boolean; observed: string; expected?: string }>,
  ): Promise<void> => {
    try {
      const result = await run();
      if (!result.ok) failures += 1;
      if (result.ok) console.log(`[probe7] ${label} ok — ${result.observed}`);
      else {
        const vitals = await view();
        console.log(`[probe7] ${label} FAIL — expected ${result.expected ?? "?"}, saw ${result.observed}`);
        console.log(`[probe7] ${label} vitals — ${JSON.stringify(vitals)}`);
      }
    } catch (error) {
      failures += 1;
      console.log(`[probe7] ${label} FAIL — threw ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // This probe's checks fire requests far faster than the phases that drive the real UI do, and
      // the transport has been measured to go quiet on long chatty runs — so each check is given a
      // beat, which is harness pressure and not a product behaviour.
      await sleep(200);
    }
  };

  const precondition = (label: string, message: string): void => {
    preconditions += 1;
    console.log(`[probe7] ${label} precondition — NOT MEASURED: ${message}`);
  };

  console.log("[probe7] Phase 7 checks — toolbar actions and preview mode");
  console.log(`[probe7] diag — ${JSON.stringify(await view())}`);

  try {
    // A crashed run would leave the fixture behind; everything this probe creates lives in `FOLDER`.
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    for (const entry of SEED) {
      const absolute = join(dir, entry.relative);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, entry.body, "utf8");
    }
    pushNoteChanged(TOOLBAR_NOTE, Date.now());
    await read(scriptClick("#all-notes"));

    // 13 — the empty state, read **before** anything is opened. This app has no way back to it (no
    // close-note affordance: selecting a note is one-way and `+` starts a draft, which is a
    // document), so it exists only at boot — see the header.
    const bootState = await view();
    if (bootState.bodyVisible) {
      precondition(
        "13",
        "a document was already open, and every button is `disabled` only while nothing is open — " +
          "run `PROBE7_ONLY=1 bun start` (phases 4–6 skipped) to verify this line on a fresh window",
      );
    } else {
      await check("13", async () => {
        const filesBefore = await listNotes();
        const before = await view();
        const clicked = await readObject<{
          results: Array<{ id: string; missing: boolean; disabled: boolean | null; changed: boolean }>;
          doc: string | null;
        }>(scriptClickEveryAction(ALL_ACTION_IDS));
        if (!clicked) {
          return {
            ok: false,
            observed: "the click sweep did not answer — nothing observed",
            expected: "clicking every disabled button leaves the document empty and the notebook unchanged",
          };
        }
        const after = await view();
        const filesAfter = await listNotes();

        const allDisabled =
          before.actions.length === TOOLBAR_ACTIONS.length && before.actions.every((botton) => botton.disabled);
        const offenders = clicked.results.filter((entry) => entry.missing || entry.changed);
        const filesUnchanged = filesAfter.join("|") === filesBefore.join("|");
        const ok =
          !before.bodyVisible &&
          before.toolbarId === "toolbar" &&
          before.toolbarRole === "toolbar" &&
          allDisabled &&
          !clicked.results.some((entry) => entry.missing) &&
          offenders.length === 0 &&
          after.doc === "" &&
          filesUnchanged;

        return {
          ok,
          observed: `buttons=${before.actions.length} all-disabled=${allDisabled} changed-by-click=${JSON.stringify(offenders.map((entry) => entry.id))} doc=${JSON.stringify(after.doc)} notes=${filesAfter.length} unchanged=${filesUnchanged}`,
          expected:
            "with nothing open every button is disabled and clicking each one leaves the document empty and the notebook unchanged",
        };
      });
    }

    // Scope the list to the fixture before anything is opened (Phase 5 leaves a stale folder
    // selected, so All Notes first; the row may lag the push, hence one retry).
    let treeRow: unknown = await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
    if (treeRow !== true) {
      pushNoteChanged(TOOLBAR_NOTE, Date.now());
      await sleep(700);
      treeRow = await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
    }
    const openedToolbar = await openInPane(TOOLBAR_NOTE);
    console.log(
      `[probe7] diag — tree-row=${String(treeRow)} scope=${FOLDER} opened=${JSON.stringify(openedToolbar)}`,
    );

    // ── line 1: the four wrap actions ──────────────────────────────────────────────────────────
    // No selection: the pair goes in at the caret, with the caret between the two halves. With a
    // selection: the text is wrapped and stays selected. The document is asserted exactly, so a
    // marker landing in the wrong place fails here rather than passing on a substring.
    for (const wrap of WRAP_ACTIONS) {
      await check(wrap.label, async () => {
        const marker = wrap.marker;
        await read(scriptSetDocument("alpha\n", 0, 0));
        const bare = await applyAction(wrap.id, `${marker}${marker}alpha\n`);
        await read(scriptSetDocument("alpha\n", 0, 5));
        const wrapped = await applyAction(wrap.id, `${marker}alpha${marker}\n`);
        const caretBetween = bare.selection !== null && bare.selection.from === marker.length && bare.selection.to === marker.length;
        const keptSelected = wrapped.selection !== null && wrapped.selection.text === "alpha";
        const ok = bare.doc === `${marker}${marker}alpha\n` && caretBetween && wrapped.doc === `${marker}alpha${marker}\n` && keptSelected;
        return {
          ok,
          observed: `no-selection=${JSON.stringify(bare.doc)} caret=${bare.selection ? bare.selection.from : "?"} between-pair=${caretBetween} | with-selection=${JSON.stringify(wrapped.doc)} selected=${JSON.stringify(wrapped.selection?.text ?? null)}`,
          expected: `${wrap.id} inserts "${marker}${marker}" with the caret between the pair, and wraps a selection keeping it selected`,
        };
      });
    }

    // ── line 2: headings toggle ────────────────────────────────────────────────────────────────
    await check("2", async () => {
      const readings: string[] = [];
      const step = async (id: string, expected: string): Promise<boolean> => {
        const state = await applyAction(id, expected);
        readings.push(`${id}→${JSON.stringify(state.doc)}`);
        return state.doc === expected;
      };
      await read(scriptSetDocument("plain line\n", 0, 0));
      const added = await step("h1", "# plain line\n");
      const removed = await step("h1", "plain line\n");
      const other = await step("h2", "## plain line\n");
      const replaced = await step("h1", "# plain line\n");
      return {
        ok: added && removed && other && replaced,
        observed: readings.join(" "),
        expected: "h1 adds the prefix, a second click removes it, h2 on a plain line adds its own, and h1 on an H2 replaces it",
      };
    });

    // ── line 3: lists toggle and convert ───────────────────────────────────────────────────────
    await check("3", async () => {
      const readings: string[] = [];
      const step = async (id: string, expected: string): Promise<string> => {
        const state = await applyAction(id, expected);
        readings.push(`${id}→${JSON.stringify(state.doc)}`);
        return state.doc ?? "";
      };
      await read(scriptSetDocument("item\n", 0, 0));
      const bullet = await step("bulletList", "- item\n");
      const untoggled = await step("bulletList", "item\n");
      const numbered = await step("numberedList", "1. item\n");
      const backToBullet = await step("bulletList", "- item\n");
      const converted = await step("taskList", "- [ ] item\n");
      const expected = ["- item\n", "item\n", "1. item\n", "- item\n", "- [ ] item\n"];
      const actual = [bullet, untoggled, numbered, backToBullet, converted];
      const duplicated = actual.some((text) => text.includes("- - ") || text.includes("- [ ] -"));
      return {
        ok: actual.join("|") === expected.join("|") && !duplicated,
        observed: readings.join(" ") + ` duplicated-prefix=${duplicated}`,
        expected: "bullet → prefix, same type twice → removed, numbered converts, and bullet → task replaces `- ` with `- [ ] ` (never `- - [ ] `)",
      };
    });

    // ── line 4: link ───────────────────────────────────────────────────────────────────────────
    await check("4", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const bare = await applyAction("link", "[link text](https://example.com)alpha\n");
      await read(scriptSetDocument("alpha\n", 0, 5));
      const selected = await applyAction("link", "[alpha](https://example.com)\n");
      const ok =
        bare.doc === "[link text](https://example.com)alpha\n" &&
        bare.selection?.text === "link text" &&
        selected.doc === "[alpha](https://example.com)\n" &&
        selected.selection?.text === "https://example.com";
      return {
        ok,
        observed: `no-selection=${JSON.stringify(bare.doc)} selected=${JSON.stringify(bare.selection?.text ?? null)} | with-selection=${JSON.stringify(selected.doc)} selected=${JSON.stringify(selected.selection?.text ?? null)}`,
        expected: "no selection inserts `[link text](https://example.com)` selecting `link text`; with a selection it keeps the text and selects the URL",
      };
    });

    // ── line 5: image ──────────────────────────────────────────────────────────────────────────
    await check("5", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const state = await applyAction("image", "![alt text](https://placehold.co/400x200)alpha\n");
      const ok = state.doc === "![alt text](https://placehold.co/400x200)alpha\n" && state.selection?.text === "alt text";
      return {
        ok,
        observed: `doc=${JSON.stringify(state.doc)} selected=${JSON.stringify(state.selection?.text ?? null)}`,
        expected: "image inserts `![alt text](https://placehold.co/400x200)` and selects `alt text`",
      };
    });

    // ── line 6: quote is a prefix, not a toggle ────────────────────────────────────────────────
    // Measured, not specified: the package always prepends, so a second click yields `> > `. This
    // line asserts the package's behaviour rather than a toggle nobody asked for.
    await check("6", async () => {
      await read(scriptSetDocument("quoted\n", 0, 0));
      const once = await applyAction("quote", "> quoted\n");
      const twice = await applyAction("quote", "> > quoted\n");
      const ok = once.doc === "> quoted\n" && twice.doc === "> > quoted\n";
      return {
        ok,
        observed: `once=${JSON.stringify(once.doc)} twice=${JSON.stringify(twice.doc)}`,
        expected: "quote prefixes `> ` (it is not a toggle), so a second click yields `> > `",
      };
    });

    // ── line 7: a valid code block can be created from the toolbar ─────────────────────────────
    await check("7a", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const state = await applyAction("codeBlock", `${CODE_BLOCK_SAMPLE}alpha\n`);
      // The package's caret is `from + 4` — inside the fence's info string, not on a body line.
      const ok = state.doc === `${CODE_BLOCK_SAMPLE}alpha\n` && state.selection?.from === 4;
      return {
        ok,
        observed: `doc=${JSON.stringify(state.doc)} caret=${state.selection ? state.selection.from : "?"}`,
        expected: "codeBlock with no selection inserts the package's javascript fence and puts the caret at from+4",
      };
    });

    await check("7b", async () => {
      await read(scriptSetDocument("alpha\n", 0, 5));
      const state = await applyAction("codeBlock", "```\nalpha\n```\n");
      const ok = state.doc === "```\nalpha\n```\n";
      return {
        ok,
        observed: `doc=${JSON.stringify(state.doc)} caret=${state.selection ? state.selection.from : "?"}`,
        expected: "codeBlock with a selection fences the selection instead of inserting the sample",
      };
    });

    // ── line 8: the three block inserts, payload text included ─────────────────────────────────
    await check("8a", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const state = await applyAction("hr", "alpha\n\n---\n\n");
      const ok = state.doc === "alpha\n\n---\n\n";
      return { ok, observed: `doc=${JSON.stringify(state.doc)}`, expected: "hr inserts `\\n\\n---\\n` after the caret's line" };
    });

    await check("8b", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const expected = `alpha\n\n${TABLE_SAMPLE}\n\n`;
      const state = await applyAction("table", expected);
      return {
        ok: state.doc === expected,
        observed: `doc=${JSON.stringify(state.doc)}`,
        expected: "table inserts the package's 3-column sample after the caret's line",
      };
    });

    await check("8c", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const expected = `alpha\n\n${DIAGRAM_SAMPLE}\n\n`;
      const state = await applyAction("diagram", expected);
      return {
        ok: state.doc === expected,
        observed: `doc=${JSON.stringify(state.doc)}`,
        expected: "diagram inserts the package's `flowchart LR` mermaid sample after the caret's line",
      };
    });

    // ── line 9: math, by hand, in the block form ───────────────────────────────────────────────
    // The action lays down `$$` / one space / `$$` and leaves the caret on that middle line, where a
    // formula typed by the user renders. **The space is the point of this check's shape**: an *empty*
    // middle line makes the package's math plugin throw (`Decoration.replace({}).range(from, from)`
    // is an invalid replacement range), which leaves the widget missing and takes every later math
    // render in that view with it — so the doc is asserted byte for byte, space included.
    await check("9", async () => {
      const formula = "e^{i\\pi}+1=0";
      await read(scriptSetDocument("alpha\n", 0, 0));
      const placed = await applyAction("math", "alpha\n\n$$\n \n$$\n\n");
      const caretOnMiddle =
        placed.selection !== null &&
        placed.caretLineText === " " &&
        placed.caretAtLineStart &&
        placed.selection.from === 10;
      await read(scriptInsertText(formula));
      const typed = await viewEventually((state) => state.doc === `alpha\n\n$$\n${formula} \n$$\n\n`);
      // The caret's own line stays raw, so move it away before asking whether the block rendered.
      await read(scriptSetCaret(1));
      const rendered = await viewEventually((state) => state.mathPreview > 0, 8_000);
      const diagnostic = (await readState(SCRIPT_CONTENT_DIAGNOSTIC)) as ContentDiagnostic | null;
      // Controls: the same formula opened from disk — phase 6's bytes, whose render was measured in
      // this build by `PROBE6_ONLY=1`. The open is asserted before the render is read: a control that
      // never opened would otherwise report the previous note's reading as its own.
      await openInPane(MATH_SEEDED);
      const seededOpened = await viewEventually(
        (state) => state.noteId === MATH_SEEDED && state.doc === MATH_SEEDED_BODY,
      );
      const phase6Control = await viewEventually((state) => state.mathPreview > 0, 6_000);
      const seededDiagnostic = (await readState(SCRIPT_CONTENT_DIAGNOSTIC)) as ContentDiagnostic | null;
      const seededOk = seededOpened.noteId === MATH_SEEDED && seededOpened.doc === MATH_SEEDED_BODY;
      const ok =
        placed.doc === "alpha\n\n$$\n \n$$\n\n" &&
        caretOnMiddle &&
        typed.doc === `alpha\n\n$$\n${formula} \n$$\n\n` &&
        rendered.mathPreview > 0 &&
        rendered.katexInMath > 0;
      return {
        ok,
        observed: `placed=${JSON.stringify(placed.doc)} caret=${placed.selection ? placed.selection.from : "?"} middle-line=${JSON.stringify(placed.caretLineText)} at-line-start=${placed.caretAtLineStart} typed=${JSON.stringify(typed.doc)} math-preview=${rendered.mathPreview} katex=${rendered.katexInMath} | control-opened=${seededOk} control-math-preview=${phase6Control.mathPreview} | typed-dom: focus=${diagnostic?.hasFocus} hidden=${diagnostic?.hiddenLines} math-block-lines=${diagnostic?.mathBlockLines} markdown=${diagnostic?.markdownPreview} relevant=${JSON.stringify(diagnostic?.relevantClasses ?? [])} | control-dom: focus=${seededDiagnostic?.hasFocus} hidden=${seededDiagnostic?.hiddenLines} math-block-lines=${seededDiagnostic?.mathBlockLines} markdown=${seededDiagnostic?.markdownPreview} relevant=${JSON.stringify(seededDiagnostic?.relevantClasses ?? [])}`,
        expected: "math inserts `$$`/space/`$$` with the caret at the start of the middle line, and the formula typed there renders KaTeX",
      };
    });

    // ── line 10: every action from a collapsed caret on an empty note ──────────────────────────
    // One continuous document: each action is applied from a collapsed caret on an empty line, and
    // every construct must then appear exactly once — which is what catches an action that shares
    // state with another (a leaked mode, a stale handler) as a doubled prefix.
    await check("10", async () => {
      await read(scriptSetDocument("", 0, 0));
      const swept = await readObject<{
        error: string | null;
        results: Array<{ id: string; missing: boolean; disabled: boolean | null; grew: boolean }>;
        doc: string | null;
      }>(scriptSweepActions(DOCUMENT_ACTION_IDS));
      if (!swept) {
        return {
          ok: false,
          observed: "the sweep read did not answer — nothing observed",
          expected: "the sweep returns its per-action readings and the document they produced",
        };
      }
      const doc = swept.doc ?? "";
      const lines = doc.split("\n");
      const countOf = (text: string): number => lines.filter((line) => line === text).length;
      const missingMarkers = SWEEP_LINES.filter((entry) => countOf(entry.line) !== entry.count).map(
        (entry) => `${JSON.stringify(entry.line)}x${countOf(entry.line)}≠${entry.count}`,
      );
      const duplicates = lines.filter((line) => DUPLICATED_PREFIXES.some((pattern) => pattern.test(line)));
      const unexpected = lines.filter((line) => !SWEEP_ALLOWED.includes(line));
      const noGrowth = swept.results.filter((entry) => entry.missing || entry.disabled !== false || !entry.grew).map(
        (entry) => entry.id,
      );
      const ok =
        swept.error === null &&
        noGrowth.length === 0 &&
        missingMarkers.length === 0 &&
        duplicates.length === 0 &&
        unexpected.length === 0;
      return {
        ok,
        observed: `actions=${swept.results.length} no-growth=${JSON.stringify(noGrowth)} bad-markers=${JSON.stringify(missingMarkers)} duplicated-prefixes=${JSON.stringify(duplicates)} unexpected-lines=${JSON.stringify(unexpected)} lines=${lines.length}`,
        expected: "all 18 document actions insert from a collapsed caret, each construct appears exactly once, and no line carries two prefixes",
      };
    });

    // ── line 11: preview mode ──────────────────────────────────────────────────────────────────
    // The mode's source of truth is the view; `data-mode` is its rendering, and the rendered
    // subtree going to zero in raw is what proves the switch reconfigured the extensions.
    await check("11", async () => {
      const opened = await openInPane(MODE_NOTE);
      const hybrid = await viewEventually((state) => state.mode === "hybrid" && state.renderedBlocks > 0);
      const docBefore = hybrid.doc;
      await read(scriptClickAction(PREVIEW_MODE_ACTION));
      const raw = await viewEventually((state) => state.mode === "raw" && state.renderedBlocks === 0, 6_000);
      await read(scriptClickAction(PREVIEW_MODE_ACTION));
      const back = await viewEventually((state) => state.mode === "hybrid" && state.renderedBlocks > 0, 6_000);
      const unchanged = raw.doc === docBefore && back.doc === docBefore;
      const ok =
        opened.doc === MODE_BODY &&
        hybrid.renderedBlocks > 0 &&
        raw.mode === "raw" &&
        raw.renderedBlocks === 0 &&
        back.mode === "hybrid" &&
        back.renderedBlocks > 0 &&
        unchanged;
      return {
        ok,
        observed: `mode=${hybrid.mode}→${raw.mode}→${back.mode} rendered=${hybrid.renderedBlocks}→${raw.renderedBlocks}→${back.renderedBlocks} aria-pressed=${hybrid.ariaPressed}→${raw.ariaPressed}→${back.ariaPressed} doc-unchanged=${unchanged}`,
        expected: "the button flips data-mode hybrid↔raw, the rendered subtree goes to zero in raw and back in hybrid, and the document is untouched",
      };
    });

    // ── line 12: the switch is neither a save point nor a way to lose text ─────────────────────
    await check("12", async () => {
      const marker = "typed before the switch";
      await read(scriptSetDocument(`${marker}\n`, 0, 0));
      await read(scriptClickAction(PREVIEW_MODE_ACTION));
      const raw = await viewEventually((state) => state.mode === "raw", 6_000);
      const onDisk = await waitForFile(MODE_NOTE, (text) => text.includes(marker));
      await read(scriptClickAction(PREVIEW_MODE_ACTION));
      const back = await viewEventually((state) => state.mode === "hybrid", 6_000);
      const ok = raw.mode === "raw" && (onDisk ?? "").includes(marker) && back.doc === `${marker}\n`;
      return {
        ok,
        observed: `mode-during-save=${raw.mode} dirty=${raw.dirty} file=${JSON.stringify(onDisk)} doc-after-switch-back=${JSON.stringify(back.doc)}`,
        expected: "text typed before the mode switch still reaches the .md, and the document survives the round trip",
      };
    });

    // ── line 14: ⌘B inserts no formatting ──────────────────────────────────────────────────────
    // `enableKeymap: false` gates the package's `Mod-b`/`Mod-i`/`Mod-k` keymap (measured in
    // `lib/index.js`); the bare `Enter` is the control that proves the harness delivers keydowns to
    // CodeMirror at all, so "nothing happened" is a reading and not a silent no-op. The menu half of
    // this line stays manual: the accelerators belong to the ApplicationMenu (Phase 2's check).
    await check("14", async () => {
      await read(scriptSetDocument("alpha\n", 0, 0));
      const control = (await readState(scriptPressKey("Enter", { meta: false, ctrl: false }))) as {
        prevented: boolean;
        doc: string;
      };
      await read(scriptSetDocument("alpha\n", 0, 0));
      const metaB = (await readState(scriptPressKey("b", { meta: true, ctrl: false }))) as {
        prevented: boolean;
        doc: string;
      };
      const ctrlB = (await readState(scriptPressKey("b", { meta: false, ctrl: true }))) as {
        prevented: boolean;
        doc: string;
      };
      const controlGrew = typeof control === "object" && control.doc !== "alpha\n";
      const unchanged = metaB?.doc === "alpha\n" && ctrlB?.doc === "alpha\n";
      const noBold = !(metaB?.doc ?? "").includes("**") && !(ctrlB?.doc ?? "").includes("**");
      const ok = controlGrew && unchanged && noBold;
      return {
        ok,
        observed: `enter-control=${JSON.stringify(control?.doc)} grew=${controlGrew} | mod-b=${JSON.stringify(metaB?.doc)} ctrl-b=${JSON.stringify(ctrlB?.doc)} unchanged=${unchanged} no-bold-markup=${noBold}`,
        expected: "the Enter control grows the document (so keys reach the keymap) while both ⌘B/⌃B variants insert no bold markup",
      };
    });
  } finally {
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    // Removing the fixture is another out-of-band disk change: the app's push is the only thing that
    // makes it re-read (§9.1). The payload is ignored by the view — a refresh is all it asks for.
    pushNoteChanged("", Date.now());
    console.log(
      `[probe7] done — ${failures} failure(s), ${preconditions} precondition(s); fixture removed`,
    );
  }
};
