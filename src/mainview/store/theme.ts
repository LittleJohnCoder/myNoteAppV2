import { create } from "zustand";
import { persist } from "zustand/middleware";

/** SPEC §10.5: the shell's two themes. `data-theme` carries exactly these strings (§11.3). */
export type NoteTheme = "light" | "dark";

/**
 * The initial value on a first run: the OS preference. A stored preference wins over this,
 * because `persist` hydrates over the initial state (SPEC §10.5, CODE_STYLE §10.4).
 */
const systemTheme = (): NoteTheme =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

export interface ThemeState {
  theme: NoteTheme;
  setTheme: (theme: NoteTheme) => void;
  toggleTheme: () => void;
}

/**
 * The only persisted preference (CODE_STYLE §10.4). It is the single source of truth for the
 * theme: one effect in the shell controller writes `data-theme` on `<html>` from this value and
 * nothing else touches that attribute (SPEC §10.5, CODE_STYLE §11.3) — no component ever checks
 * the theme itself.
 */
export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: systemTheme(),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
    }),
    { name: "mynoteappv2.theme" },
  ),
);

export const useNoteTheme = (): NoteTheme => useTheme((state) => state.theme);

export const useToggleTheme = (): ThemeState["toggleTheme"] =>
  useTheme((state) => state.toggleTheme);
