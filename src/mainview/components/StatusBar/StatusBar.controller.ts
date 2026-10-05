import { useEditorLineCount, useEditorWordCount } from "@/store/editorStats";
import { useSelectedNoteId } from "@/store/selectedNote";
import { useNoteTheme, useToggleTheme } from "@/store/theme";
import { noteLocation } from "@/utils/noteLocation";

/** SPEC §10.3: with no note open every field returns to this. */
export const EMPTY_FIELD = "—";

export interface StatusBarController {
  theme: string;
  themeLabel: string;
  toggleLabel: string;
  words: string;
  lines: string;
  location: string;
  handleToggleTheme: () => void;
}

/**
 * SPEC §10.3: the counts come from the editor's **live document** — the pane publishes them to
 * `store/editorStats` as they change, so a keystroke moves them without a save — and the path is
 * derived from the open note's id, which *is* its path (§9.1).
 *
 * The raw numbers are also returned as `data-*` attributes by the component, because a probe should
 * read the value rather than parse "Words: 12".
 */
export const useStatusBarController = (): StatusBarController => {
  const theme = useNoteTheme();
  const toggleTheme = useToggleTheme();
  const wordCount = useEditorWordCount();
  const lineCount = useEditorLineCount();
  const selectedNoteId = useSelectedNoteId();

  return {
    theme,
    themeLabel: `Theme: ${theme}`,
    toggleLabel: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
    words: wordCount === null ? EMPTY_FIELD : String(wordCount),
    lines: lineCount === null ? EMPTY_FIELD : String(lineCount),
    location: selectedNoteId === null ? EMPTY_FIELD : noteLocation(selectedNoteId),
    handleToggleTheme: toggleTheme,
  };
};
