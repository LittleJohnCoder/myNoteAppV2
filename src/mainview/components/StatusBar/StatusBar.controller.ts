import { useToggleTheme, useNoteTheme } from "@/store/theme";

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
 * The status bar's fields are placeholders in Phase 4 (SPEC §10.5: "the status bar renders `—`
 * per field"); Phase 5 fills them from the open note. The theme toggle is real from the start —
 * it is the store's only writer and drives `data-theme` (SPEC §10.5).
 */
export const useStatusBarController = (): StatusBarController => {
  const theme = useNoteTheme();
  const toggleTheme = useToggleTheme();

  return {
    theme,
    themeLabel: `Theme: ${theme}`,
    toggleLabel: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
    words: "—",
    lines: "—",
    location: "—",
    handleToggleTheme: toggleTheme,
  };
};
