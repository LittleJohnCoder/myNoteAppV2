import type { TOOLBAR_ACTIONS } from "./Toolbar.constants";

import type { EditorView } from "@codemirror/view";

/**
 * The union of the toolbar's ids, derived from the one list that defines them (CODE_STYLE §4.3) —
 * so a button and its handler can never disagree about the spelling of an id.
 *
 * Every id but `math` and `preview-mode` is a key of the package's own `actions` map (SPEC §10.1);
 * `PackageActionKey` in `codemirror-markdown-hybrid.d.ts` is what enforces that assignment.
 */
export type ToolbarActionId = (typeof TOOLBAR_ACTIONS)[number]["id"];

/**
 * What the toolbar needs, and the pane is the only thing that can supply it (SPEC §10.1).
 *
 * `getView` is an **accessor**, not a value: the editor view is created in `EditorPane`'s mount
 * effect, which runs after this component's first render, so a view passed as a value would be
 * `null` for the toolbar's whole first render and only an unrelated re-render would fix it. Each
 * handler therefore reads the view at click time, through the pane's own handle.
 */
export interface ToolbarControllerOptions {
  getView: () => EditorView | null;
  /** A note or a draft is open — with nothing bound there is nothing to format (§10.1). */
  isEnabled: boolean;
}
