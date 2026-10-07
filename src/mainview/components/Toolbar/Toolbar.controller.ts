import { useCallback, useState } from "react";

import { actions, getMode, setMode } from "codemirror-markdown-hybrid";

import { MATH_ACTION, PREVIEW_MODE_ACTION } from "./Toolbar.constants";

import type { EditorView } from "@codemirror/view";
import type { HybridMarkdownMode } from "codemirror-markdown-hybrid";
import type { ToolbarActionId, ToolbarControllerOptions } from "./Toolbar.types";

/** The mode a fresh view starts in: `hybridMarkdown({ enablePreview: true })` (SPEC §10.1). */
const DEFAULT_MODE: HybridMarkdownMode = "hybrid";

/**
 * A math block is a line whose trimmed text is exactly `$$` (§10.6), so the `math` button inserts
 * the **block** form — two `$$` lines with a line between them for the formula — and puts the caret
 * at the start of that middle line, which is where the user types. A one-line `$$…$$` renders as
 * literal text, so the block form is the only one that can render.
 *
 * It goes below the caret's line after a blank separator, the way the package's own `hr`, `table`
 * and `diagram` actions place theirs, so every block construct lands the same way.
 *
 * **The middle line holds one space, and that space is load-bearing** (measured 2026-10-06). The
 * package's math plugin replaces every line between the delimiters with
 * `Decoration.replace({}).range(line.from, line.to)`, and CodeMirror throws
 * `Invalid range for replacement decoration` for an empty range — so a block whose middle line is
 * *empty* throws inside the transaction that renders it. That happens whenever the block is drawn
 * with no line of it focused, which is exactly the state a toolbar click starts from (the button
 * holds the focus), and the throw takes the plugin's decorations — and every later math render in
 * that view — down with it. One space keeps the range non-empty, is invisible in the file, and
 * renders as an empty formula; the user's first keystroke lands before it.
 */
const MATH_SEPARATOR = "\n\n";
const MATH_BLOCK = "$$\n \n$$\n";
const MATH_BLOCK_OPEN = "$$\n";

/** Where the caret goes in `MATH_BLOCK`: the start of the middle line, just before that space. */
const MATH_CARET_OFFSET = MATH_SEPARATOR.length + MATH_BLOCK_OPEN.length;

export interface ToolbarController {
  /** The view's mode, for the preview-mode button's `data-mode` (§10.1, §10.6). */
  mode: HybridMarkdownMode;
  previewTitle: string;
  handleAction: (id: ToolbarActionId) => void;
}

/** SPEC §10.1: `math` has no package key, so it is inserted by hand — in the only form that renders. */
const insertMathBlock = (view: EditorView): void => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const insert = `${MATH_SEPARATOR}${MATH_BLOCK}`;

  view.dispatch({
    changes: { from: line.to, insert },
    // The caret lands at the start of the middle line — where the formula goes, just before the
    // space that keeps the block's decoration ranges valid.
    selection: { anchor: line.to + MATH_CARET_OFFSET },
  });
};

/**
 * The toolbar's logic: one dispatch per action, against the live view (SPEC §10.1).
 *
 * Three rules the spec pins, and the reason each is here rather than in the component:
 *
 *   - **The view is read at click time**, through the pane's accessor — it is created in a mount
 *     effect after this component's first render.
 *   - **Every action with a package key dispatches the package's own body**, so the toolbar never
 *     grows a second implementation of the markdown the editor renders (§10.1).
 *   - **The mode's source of truth is the view.** `mode` below is the button's rendering of
 *     `getMode(view)`, refreshed from the view after the dispatch that changed it — never held as
 *     the real state, which is what would let a store disagree with the editor.
 */
export const useToolbarController = (options: ToolbarControllerOptions): ToolbarController => {
  const { getView } = options;
  const [mode, setModeState] = useState<HybridMarkdownMode>(DEFAULT_MODE);

  const handleAction = useCallback(
    (id: ToolbarActionId): void => {
      const view = getView();
      if (!view) return;

      if (id === PREVIEW_MODE_ACTION) {
        setMode(view, getMode(view) === "hybrid" ? "raw" : "hybrid");
        setModeState(getMode(view));
      } else if (id === MATH_ACTION) {
        insertMathBlock(view);
      } else {
        // Every other id **is** the package's action key, and this is the package's own body (§10.1).
        actions[id](view);
      }

      // The button took the focus and the user's next act is typing (§10.1). The order is fine: the
      // click's blur flushed the pending save, and the dispatch above starts a fresh 500 ms debounce.
      view.focus();
    },
    [getView],
  );

  return {
    mode,
    previewTitle: mode === "raw" ? "Show the rendered preview" : "Show raw Markdown",
    handleAction,
  };
};
