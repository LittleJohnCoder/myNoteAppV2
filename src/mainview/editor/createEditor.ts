import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setTheme as applyHybridTheme } from "codemirror-markdown-hybrid";

import { editorExtensions } from "./extensions";

import type { NoteTheme } from "@/store/theme";

declare global {
  interface Window {
    /**
     * The dev-only read-back handle (SPEC §10.1, §10.6). This editor's document lives in
     * `EditorState`, so no DOM query can read or drive it — every Phase 5+ check needs this handle.
     * The pane's controller assigns it when bun says the channel is `dev` and nulls it on unmount.
     */
    __notesEditor: EditorView | null;
  }
}

export interface EditorHandle {
  readonly view: EditorView;
  /** The live document — the source of truth between saves (CODE_STYLE §8.5). */
  readDocument: () => string;
  /** Swaps the document in without reporting it as an edit: loading a note is not typing (§9.1). */
  loadDocument: (text: string) => void;
  /** Puts the caret at line 1 and focuses the body — what opening a note does (SPEC §10.1). */
  focusDocument: () => void;
  /** Live theme switch off the store's value (SPEC §10.1's `setTheme(view, theme)`). */
  applyTheme: (theme: NoteTheme) => void;
  destroy: () => void;
}

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc: string;
  theme: NoteTheme;
  onChange: (view: EditorView) => void;
  onBlur: () => void;
}

/**
 * The single factory every editor instance comes from (CODE_STYLE §8.1): components never touch
 * extension config, and there is exactly one editor in this app.
 */
export const createEditor = ({
  parent,
  doc,
  theme,
  onChange,
  onBlur,
}: CreateEditorOptions): EditorHandle => {
  /**
   * A programmatic swap must not look like a keystroke: the update listener is what schedules a
   * save, and re-queuing a note's own text would write the file for nothing (SPEC §9.1).
   */
  let isLoadingDocument = false;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: editorExtensions({
        theme,
        onChange: (updated) => {
          if (!isLoadingDocument) onChange(updated);
        },
        onBlur,
      }),
    }),
  });

  return {
    view,
    readDocument: () => view.state.doc.toString(),
    loadDocument: (text) => {
      isLoadingDocument = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      isLoadingDocument = false;
    },
    focusDocument: () => {
      view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
      view.focus();
    },
    applyTheme: (next) => applyHybridTheme(view, next),
    destroy: () => view.destroy(),
  };
};
