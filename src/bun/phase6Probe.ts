import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Phase 6's dev-only probe (todo.md's Phase 6 Verification): the interactive half of the editor —
 * task write-back, heading collapse, KaTeX, Mermaid, fenced-code highlighting, live theme.
 *
 * The phase is mostly *verification*, not implementation: `codemirror-markdown-hybrid@1.2.2` already
 * ships the write-back, the collapse control, the math/mermaid widgets and the fence highlighter, and
 * Phase 5 wired the live `setTheme`. What this file adds is the proof, and three package facts decide
 * its shape — all read from the installed package, not from its README:
 *
 *   - **A checkbox toggles on `mousedown`, not `click`** (`lib/extensions/hybrid-preview.js:184`),
 *     and the handler replaces the *whole line* the widget was built for — so check 1 clicks a real
 *     `mousedown` on the rendered input and asserts the *disk* line, which is what fails if the
 *     rewrite lands on the neighbouring task.
 *   - **A math block is a line whose trimmed text is exactly `$$`** (`:447`). `$$e^{i\pi}+1=0$$` on
 *     one line is therefore **not** a block and renders as literal text; only the block form produces
 *     `.cm-math-preview` (check 4 uses the block form and measures the one-line form as its control,
 *     so the difference is evidence rather than opinion). Inline `$…$` renders KaTeX too, but inside
 *     the line's `.cm-markdown-preview`, with no `.cm-math-preview` wrapper.
 *   - **Rendering is for lines that are not the caret's, and only inside the viewport**
 *     (`buildDecorations`: `view.visibleRanges` + `getFocusedLines`). Every check below therefore
 *     opens the note (which puts the caret on line 1), reads a class the *package* emits, and polls
 *     to a deadline rather than sleeping — Mermaid draws asynchronously, the checkbox save rides the
 *     500 ms debounce, and React commits between two scripts, never inside one.
 *
 * The disk is the oracle wherever a write is claimed: check 1 asserts the file's bytes, check 3
 * asserts the file is *untouched* (collapse is view state), and the theme check restores the
 * `localStorage` value it found so Phase 4's two-run persistence proof is left armed.
 *
 * Fixture: `Probe6/`, namespaced like its predecessors and removed in `finally` — the notebook must
 * be empty afterwards. A single `FAIL` line means the phase's acceptance is not met.
 */

export type EvaluateScript = (script: string) => Promise<unknown>;

export interface Phase6ProbeContext {
  dir: string;
  evaluate: EvaluateScript;
  /** Out-of-band disk changes (the seeds) need the app's own re-read trigger (SPEC §9.1). */
  pushNoteChanged: (id: string, updatedAt: number) => void;
}

const FOLDER = "Probe6";

const TASKS = `${FOLDER}/tasks.md`;
const COLLAPSE = `${FOLDER}/collapse.md`;
const MATH = `${FOLDER}/math.md`;
const INLINE_MATH = `${FOLDER}/math-inline.md`;
const DIAGRAM = `${FOLDER}/diagram.md`;
const CODE = `${FOLDER}/code.md`;

/** Two tasks, one ticked: index 0 in the DOM is the first task line, and it must be the one that changes. */
const TASKS_BODY = ["# Tasks", "", "- [ ] first task", "- [x] second task", ""].join("\n");

/** H1 + two H2s: collapsing the first H2 hides the three lines below it and nothing else. */
const COLLAPSE_BODY = [
  "# Collapse",
  "",
  "intro line",
  "",
  "## Section",
  "hidden body line",
  "another line",
  "",
  "## Second",
  "tail",
  "",
].join("\n");

/** The block form: `$$` alone on its lines is what the package recognises as math (see the header). */
const MATH_BODY = ["# Math", "", "$$", "e^{i\\pi}+1=0", "$$", ""].join("\n");

/** The control for the same formula in one line — renders as text, with no `.cm-math-preview`. */
const INLINE_MATH_BODY = ["# Inline", "", "Euler: $e^{i\\pi}+1=0$", ""].join("\n");

const DIAGRAM_BODY = ["# Diagram", "", "```mermaid", "graph TD", "  A --> B", "```", ""].join("\n");

const CODE_BODY = ["# Code", "", "```js", "const answer = 42;", "```", ""].join("\n");

const SEED: Array<{ relative: string; body: string }> = [
  { relative: TASKS, body: TASKS_BODY },
  { relative: COLLAPSE, body: COLLAPSE_BODY },
  { relative: MATH, body: MATH_BODY },
  { relative: INLINE_MATH, body: INLINE_MATH_BODY },
  { relative: DIAGRAM, body: DIAGRAM_BODY },
  { relative: CODE, body: CODE_BODY },
];

/** Ticked first task: what check 1 must leave on disk, and what check 2 must reopen. */
const TASKS_AFTER_TICK = TASKS_BODY.replace("- [ ] first task", "- [x] first task");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const quote = (value: string): string => JSON.stringify(value);

/** What one view script reports about the rendered editor. `-1`/`null` mean "not observed". */
interface RenderState {
  noteId: string | null;
  dirty: boolean;
  doc: string | null;
  /** `checked` of every rendered task checkbox, in document order. */
  checkboxes: boolean[];
  /** `.cm-collapsed-line` elements — the package's mark for a line hidden by a collapsed heading. */
  collapsed: number;
  collapseToggles: number;
  mathPreview: number;
  katexInMath: number;
  katexInline: number;
  mermaid: number;
  mermaidSvg: number;
  mermaidError: string | null;
  highlighted: number;
  highlightedText: string | null;
  tokenClasses: string[];
  headingText: string | null;
  /** The computed colour of the rendered H1 — decision 4's one permitted style reading (§10.6). */
  headingColor: string | null;
  theme: string | null;
  uptimeMs: number;
  href: string;
  error: string | null;
}

/* ── view-side scripts ────────────────────────────────────────────────────────────────────────
   Each runs through `new Function(script)` and must `return` its own value. */

/**
 * Everything Phase 6 asserts about the *rendered* surface, in one read. The classes are the ones
 * SPEC §10.6 pins as the package's own contract; nothing here depends on styling except
 * `headingColor`, which is decision 4's deliberate exception.
 */
const SCRIPT_RENDER_STATE = `
  const pane = document.querySelector("#editor-pane");
  const content = document.querySelector("#editor-pane .cm-content");
  const editor = window.__notesEditor;
  const heading = content ? content.querySelector(".cm-markdown-preview .md-h1") : null;
  const tokens = content
    ? Array.from(content.querySelectorAll(".cm-highlighted-code span")).map((span) => span.className)
    : [];
  const count = (selector) => (content ? content.querySelectorAll(selector).length : -1);
  return {
    noteId: (pane ? pane.getAttribute("data-note-id") : "") || null,
    dirty: pane ? pane.getAttribute("data-dirty") === "true" : false,
    doc: editor ? editor.state.doc.toString() : null,
    checkboxes: content
      ? Array.from(content.querySelectorAll(".md-list-item input[type=checkbox]")).map((box) => box.checked)
      : [],
    collapsed: count(".cm-collapsed-line"),
    collapseToggles: count(".cm-collapse-toggle"),
    mathPreview: count(".cm-math-preview"),
    katexInMath: count(".cm-math-preview .katex"),
    katexInline: count(".cm-markdown-preview .katex"),
    mermaid: count(".cm-mermaid-preview"),
    mermaidSvg: count(".cm-mermaid-preview svg"),
    mermaidError: content
      ? (content.querySelector(".cm-mermaid-preview .mermaid-error")?.textContent ?? null)
      : null,
    highlighted: count(".cm-highlighted-code"),
    highlightedText: content
      ? (Array.from(content.querySelectorAll(".cm-highlighted-code")).map((node) => node.textContent).join("") || null)
      : null,
    tokenClasses: Array.from(new Set(tokens)).sort(),
    headingText: heading ? heading.textContent : null,
    headingColor: heading ? getComputedStyle(heading).color : null,
    theme: document.documentElement.getAttribute("data-theme"),
    uptimeMs: Math.round(performance.now()),
    href: location.href,
    error: document.querySelector("#editor-error")?.textContent ?? null,
  };
`;

const scriptClick = (selector: string): string => `
  const element = document.querySelector(${quote(selector)});
  if (!element) return false;
  element.click();
  return true;
`;

/** Puts the caret on a line without changing the document — what decides which lines stay raw. */
const scriptSetCaret = (lineNumber: number): string => `
  const editor = window.__notesEditor;
  if (!editor) return "no-editor";
  const line = editor.state.doc.line(Math.min(${lineNumber}, editor.state.doc.lines));
  editor.dispatch({ selection: { anchor: line.from } });
  return line.number;
`;

/**
 * The task toggle as the user performs it: a `mousedown` on the rendered checkbox. The package's
 * handler lives on the line's wrapper and bails on any other event type, so a `click` here would be
 * silently inert — the failure this check would then report as a product bug.
 */
const scriptToggleCheckbox = (index: number): string => `
  const boxes = document.querySelectorAll("#editor-pane .cm-content .md-list-item input[type=checkbox]");
  const box = boxes[${index}];
  if (!box) return "no-checkbox";
  box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  return true;
`;

/** Clicks the collapse control of the **first H2** — the H1 has one too, and clicking that would pass. */
const scriptClickSecondLevelToggle = (): string => `
  const wrappers = Array.from(document.querySelectorAll("#editor-pane .cm-content .cm-heading-preview"));
  const heading = wrappers.find((wrapper) => wrapper.querySelector(".md-h2"));
  const toggle = heading ? heading.querySelector(".cm-collapse-toggle") : null;
  if (!toggle) return "no-toggle";
  toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
`;

/**
 * The persisted theme, read raw. Check 7 toggles twice and restores this exact string afterwards, so
 * Phase 4's check 20 — which arms the *next* boot by writing the opposite theme into storage — is
 * still armed when this probe is done.
 */
const SCRIPT_READ_STORED_THEME = `
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i) ?? "");
  const key = keys.filter((entry) => entry.toLowerCase().includes("theme"))[0] ?? "mynoteappv2.theme";
  return { key: key, value: window.localStorage.getItem(key) };
`;

const scriptWriteStoredTheme = (key: string, value: string | null): string => `
  ${value === null ? `window.localStorage.removeItem(${quote(key)});` : `window.localStorage.setItem(${quote(key)}, ${quote(value)});`}
  return window.localStorage.getItem(${quote(key)});
`;

/* ── the probe ─────────────────────────────────────────────────────────────────────────────── */

export const runPhase6Probe = async ({
  dir,
  evaluate,
  pushNoteChanged,
}: Phase6ProbeContext): Promise<void> => {
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

  /** Actions are never retried: a retried `mousedown` is a second toggle (§9.1's rule for `+`). */
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

  const render = async (): Promise<RenderState> => {
    const state = (await readState(SCRIPT_RENDER_STATE)) as RenderState | string;
    if (typeof state === "string") {
      // A failed read is reported as "nothing observed" with the failure in `error` — never as a
      // pass on a stale guess.
      return {
        noteId: null,
        dirty: false,
        doc: null,
        checkboxes: [],
        collapsed: -1,
        collapseToggles: -1,
        mathPreview: -1,
        katexInMath: -1,
        katexInline: -1,
        mermaid: -1,
        mermaidSvg: -1,
        mermaidError: null,
        highlighted: -1,
        highlightedText: null,
        tokenClasses: [],
        headingText: null,
        headingColor: null,
        theme: null,
        uptimeMs: -1,
        href: "",
        error: state,
      };
    }
    return state;
  };

  /** Waits for the view to catch up with something asynchronous — a load, a widget, a debounce. */
  const renderEventually = async (
    matches: (state: RenderState) => boolean,
    deadlineMs = 8_000,
  ): Promise<RenderState> => {
    const deadline = Date.now() + deadlineMs;
    let state = await render();
    while (!matches(state) && Date.now() < deadline) {
      // 250 ms, not 100: the poll is the probe's whole traffic budget, and the transport has been
      // measured to stop carrying messages on a long, chatty run (lessons.md).
      await sleep(250);
      state = await render();
    }
    return state;
  };

  /** Opens a note by clicking its row and waits for the editor to bind to it (§10.1). */
  const openInPane = async (relative: string): Promise<RenderState> => {
    await read(scriptClick(`#notes-list [data-note-id='${relative}']`));
    return renderEventually((state) => state.noteId === relative && state.doc !== null);
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

  /** The disk is the oracle for a write: poll the file rather than sleeping out the debounce. */
  const waitForFile = async (
    relative: string,
    matches: (text: string) => boolean,
    deadlineMs = 6_000,
  ): Promise<string | null> => {
    const deadline = Date.now() + deadlineMs;
    let text = await fileText(relative);
    while (text !== null && !matches(text) && Date.now() < deadline) {
      await sleep(150);
      text = await fileText(relative);
    }
    return text;
  };

  let failures = 0;

  const check = async (
    n: number,
    run: () => Promise<{ ok: boolean; observed: string; expected?: string }>,
  ): Promise<void> => {
    try {
      const result = await run();
      if (!result.ok) failures += 1;
      if (result.ok) console.log(`[probe6] ${n} ok — ${result.observed}`);
      else {
        const vitals = await render();
        console.log(`[probe6] ${n} FAIL — expected ${result.expected ?? "?"}, saw ${result.observed}`);
        console.log(`[probe6] ${n} vitals — ${JSON.stringify(vitals)}`);
      }
    } catch (error) {
      failures += 1;
      console.log(
        `[probe6] ${n} FAIL — threw ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  console.log(
    "[probe6] Phase 6 checks — task write-back, collapse, math, mermaid, code, theme sync",
  );
  console.log(`[probe6] diag — ${JSON.stringify(await render())}`);

  try {
    // A crashed run would leave the fixture behind; everything this probe creates lives in `FOLDER`.
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    for (const entry of SEED) {
      const absolute = join(dir, entry.relative);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, entry.body, "utf8");
    }

    const seededMtimes = new Map<string, number | null>();
    for (const entry of SEED) seededMtimes.set(entry.relative, await mtime(entry.relative));

    // The seeds are out-of-band writes and the list has to *prove* it knows about them before any
    // check runs. Phase 5 leaves a **stale** folder selected (it removes its own fixture after the
    // fact), so the list is reset to All Notes first — a scoped list would hide the new folder no
    // matter how long a check waited.
    pushNoteChanged(TASKS, Date.now());
    await read(scriptClick("#all-notes"));
    // The push triggers the re-read, so the new folder row may not be up yet: click All Notes first,
    // retry the tree row once, and scope the list to the fixture when it lands. The list is global
    // if it does not, which the checks below survive — they open notes by id, not by position.
    let treeRow: unknown = await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
    if (treeRow !== true) {
      pushNoteChanged(TASKS, Date.now());
      await sleep(700);
      treeRow = await read(scriptClick(`button[data-folder-path='${FOLDER}']`));
    }
    const opened = await openInPane(TASKS);
    console.log(
      `[probe6] diag — tree-row=${String(treeRow)} scope=${FOLDER} opened=${JSON.stringify(opened)}`,
    );

    // 1 — a checkbox click rewrites `- [ ]` → `- [x]` **in the source**, saving through the normal
    // path (decision 1: one write mechanism). The line is asserted on disk, because that is what
    // fails if the rewrite lands on the neighbouring task.
    await check(1, async () => {
      const opened = await openInPane(TASKS);
      const before = await renderEventually((state) => state.checkboxes.length === 2);
      await read(scriptToggleCheckbox(0));
      const toggled = await renderEventually((state) => state.checkboxes[0] === true);
      const onDisk = await waitForFile(TASKS, (text) => text.includes("- [x] first task"));
      const docOk = toggled.doc !== null && toggled.doc.includes("- [x] first task");
      const neighbourKept = (onDisk ?? "").includes("- [x] second task");
      const ok =
        before.checkboxes[0] === false &&
        before.checkboxes[1] === true &&
        toggled.checkboxes[0] === true &&
        toggled.checkboxes[1] === true &&
        docOk &&
        neighbourKept;
      return {
        ok,
        observed: `checkboxes-before=${JSON.stringify(before.checkboxes)} after=${JSON.stringify(toggled.checkboxes)} dirty=${toggled.dirty} doc-has-marker=${docOk} file=${JSON.stringify(onDisk)}`,
        expected: `the ticked line is written as "- [x] first task" and "- [x] second task" is untouched`,
      };
    });

    // 2 — the toggle survives a reload: reopening the note reads the file, so the checkbox must come
    // back ticked because the *bytes* changed, not because the widget was still in memory.
    await check(2, async () => {
      await read(scriptClick(`#notes-list [data-note-id='${MATH}']`));
      await renderEventually((state) => state.noteId === MATH);
      const reopened = await openInPane(TASKS);
      const rendered = await renderEventually(
        (state) => state.checkboxes.length === 2 && state.checkboxes[0] === true,
      );
      const ok =
        reopened.doc === TASKS_AFTER_TICK &&
        rendered.checkboxes[0] === true &&
        rendered.checkboxes[1] === true;
      return {
        ok,
        observed: `doc-reopened=${JSON.stringify(rendered.doc)} checkboxes=${JSON.stringify(rendered.checkboxes)}`,
        expected: `reopening shows the document with "- [x] first task" and both checkboxes ticked`,
      };
    });

    // 3 — collapsing an H2 hides its body and expanding restores it, with the file **untouched**:
    // collapse is ephemeral view state (decision 3), so a changed file is the failure.
    await check(3, async () => {
      const opened = await openInPane(COLLAPSE);
      const beforeFile = await fileText(COLLAPSE);
      const beforeMtime = await mtime(COLLAPSE);
      const expanded = await renderEventually(
        (state) => state.collapseToggles >= 2 && state.collapsed === 0,
      );
      await read(scriptClickSecondLevelToggle());
      const collapsed = await renderEventually((state) => state.collapsed > 0);
      await read(scriptClickSecondLevelToggle());
      const restored = await renderEventually((state) => state.collapsed === 0);
      const afterFile = await fileText(COLLAPSE);
      const afterMtime = await mtime(COLLAPSE);
      const untouched = afterFile === beforeFile && afterMtime === beforeMtime;
      const ok =
        opened.doc === COLLAPSE_BODY &&
        expanded.collapseToggles >= 2 &&
        collapsed.collapsed === 3 &&
        restored.collapsed === 0 &&
        untouched;
      return {
        ok,
        observed: `toggles=${expanded.collapseToggles} collapsed-lines=${collapsed.collapsed} after-expand=${restored.collapsed} file-identical=${untouched}`,
        expected: "collapsing hides the three lines under the H2, expanding restores them, and the file is byte-identical",
      };
    });

    // 4 — `$$…$$` as a block renders KaTeX into `.cm-math-preview`. The one-line form is measured
    // in the same check as the control (see the header): a package whose block rule is "`$$` alone
    // on the line" makes the block form the only one that can satisfy this line.
    await check(4, async () => {
      const block = await openInPane(MATH);
      const formula = await renderEventually((state) => state.katexInMath > 0);
      const inline = await openInPane(INLINE_MATH);
      const inlineRendered = await renderEventually((state) => state.katexInline > 0);
      const ok =
        formula.mathPreview > 0 &&
        formula.katexInMath > 0 &&
        inlineRendered.katexInline > 0 &&
        inlineRendered.mathPreview === 0;
      return {
        ok,
        observed: `block(note="${MATH}") math-preview=${formula.mathPreview} katex-inside=${formula.katexInMath} | one-line(note="${INLINE_MATH}") math-preview=${inlineRendered.mathPreview} inline-katex=${inlineRendered.katexInline}`,
        expected: "the block form renders .cm-math-preview containing KaTeX; the one-line form renders inline KaTeX with no .cm-math-preview",
      };
    });

    // 5 — a ```mermaid fence renders a diagram. Polled to a deadline because Mermaid draws
    // asynchronously: a single read reports the empty wrapper of a diagram that is still loading.
    await check(5, async () => {
      const opened = await openInPane(DIAGRAM);
      const drawn = await renderEventually((state) => state.mermaidSvg > 0, 15_000);
      const ok = opened.doc === DIAGRAM_BODY && drawn.mermaid > 0 && drawn.mermaidSvg > 0;
      return {
        ok,
        observed: `preview=${drawn.mermaid} svg=${drawn.mermaidSvg} error=${JSON.stringify(drawn.mermaidError)}`,
        expected: "the fence renders .cm-mermaid-preview containing an <svg> (not a .mermaid-error)",
      };
    });

    // 6 — a fenced JS block is syntax-highlighted: the rendered line carries Lezer token spans, not
    // one uniform class. `.cm-highlighted-code` is the package's widget; the `tok-*` names come from
    // `@lezer/highlight`'s `classHighlighter` (lib/utils/syntax-highlight.js).
    await check(6, async () => {
      const opened = await openInPane(CODE);
      const rendered = await renderEventually((state) => state.highlighted > 0);
      const text = rendered.highlightedText ?? "";
      const ok =
        opened.doc === CODE_BODY &&
        rendered.highlighted > 0 &&
        rendered.tokenClasses.length >= 2 &&
        text.includes("const answer = 42;");
      return {
        ok,
        observed: `blocks=${rendered.highlighted} token-classes=${JSON.stringify(rendered.tokenClasses)} text=${JSON.stringify(text)}`,
        expected: "the fenced JS line renders with at least two distinct token classes, not one uniform class",
      };
    });

    // 7 — the theme drives the hybrid plugin **and** `<html data-theme>` together (decision 4's one
    // permitted style reading): a rendered heading's computed colour must change with the toggle, or
    // a stale half-dark preview would pass on presence alone.
    await check(7, async () => {
      const stored = (await readState(SCRIPT_READ_STORED_THEME)) as {
        key: string;
        value: string | null;
      };
      const opened = await openInPane(COLLAPSE);
      // The caret must be off the H1 line, or that line stays raw and there is nothing rendered to read.
      await read(scriptSetCaret(3));
      const before = await renderEventually(
        (state) => state.headingColor !== null && state.headingText === "Collapse",
      );
      await read(scriptClick("#theme-toggle"));
      const flippedTheme = await renderEventually(
        (state) => state.theme !== null && state.theme !== before.theme,
      );
      const after = await renderEventually(
        (state) => state.headingColor !== null && state.headingColor !== before.headingColor,
      );
      // Toggle back, then put the storage value back: Phase 4's check 20 arms the next boot from
      // `localStorage`, and two toggles would otherwise leave the *live* theme there instead.
      await read(scriptClick("#theme-toggle"));
      const restoredTheme = await renderEventually(
        (state) => state.theme === before.theme,
      );
      const rewritten =
        typeof stored?.key === "string"
          ? await read(scriptWriteStoredTheme(stored.key, stored.value))
          : "no-key";
      const ok =
        opened.doc === COLLAPSE_BODY &&
        before.headingColor !== null &&
        flippedTheme.theme !== before.theme &&
        after.headingColor !== before.headingColor &&
        restoredTheme.theme === before.theme;
      return {
        ok,
        observed: `theme=${before.theme}->${after.theme}->${restoredTheme.theme} heading-colour=${before.headingColor}->${after.headingColor} storage-restored=${JSON.stringify(rewritten)} (was ${JSON.stringify(stored?.value ?? null)})`,
        expected: "the toggle flips data-theme and the rendered heading's computed colour together, then both return",
      };
    });
  } finally {
    await rm(join(dir, FOLDER), { recursive: true, force: true });
    // Removing the fixture is another out-of-band disk change: the app's push is the only thing that
    // makes it re-read (§9.1). The payload is ignored by the view — a refresh is all it asks for.
    pushNoteChanged("", Date.now());
    console.log(`[probe6] done — ${failures} failure(s); fixture removed`);
  }
};
