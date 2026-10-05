export interface DocumentCounts {
  words: number;
  lines: number;
}

/**
 * SPEC §10.3: the status bar's counts come from the editor's **live document**, not the file —
 * words are whitespace-run-separated tokens and lines are the document's line count. An empty
 * document is one line, which is also what `EditorState`'s `doc.lines` reports, so the two agree.
 */
export const countDocument = (text: string): DocumentCounts => ({
  words: text.split(/\s+/).filter((token) => token.length > 0).length,
  lines: text.split("\n").length,
});
