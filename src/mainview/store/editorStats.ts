import { create } from "zustand";

/**
 * SPEC §10.3: the status bar's word and line counts come from the editor's live document, which
 * lives in `EditorState` — so the editor pane publishes them here and the status bar reads them.
 * This is the one piece of state that must cross between two sibling components (CODE_STYLE §10.1);
 * everything else about the editor stays local to its controller.
 *
 * `null` means "no note open", which the status bar renders as `—` (§10.3) — a draft is not a note,
 * so it publishes `null` too.
 */
export interface EditorStatsState {
  words: number | null;
  lines: number | null;
  setCounts: (counts: { words: number; lines: number } | null) => void;
}

export const useEditorStats = create<EditorStatsState>((set) => ({
  words: null,
  lines: null,
  setCounts: (counts) =>
    set({ words: counts?.words ?? null, lines: counts?.lines ?? null }),
}));

/** Two primitive selectors rather than one object: a fresh object identity would re-render every call. */
export const useEditorWordCount = (): number | null => useEditorStats((state) => state.words);

export const useEditorLineCount = (): number | null => useEditorStats((state) => state.lines);

export const useSetEditorCounts = (): EditorStatsState["setCounts"] =>
  useEditorStats((state) => state.setCounts);
