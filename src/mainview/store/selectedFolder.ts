import { create } from "zustand";

/**
 * SPEC §10.5: the selected folder is a notebook-relative path, and `null` is "All Notes" —
 * a real state, not an absent selection. Transient by design: nothing persists the selection
 * across restarts (only the theme is persisted; CODE_STYLE §10.4).
 */
export interface SelectedFolderState {
  folder: string | null;
  selectFolder: (folder: string | null) => void;
}

export const useSelectedFolder = create<SelectedFolderState>((set) => ({
  folder: null,
  selectFolder: (folder) => set({ folder }),
}));

/** Consumers use the selectors, never the raw store (CODE_STYLE §10.3). */
export const useSelectedFolderPath = (): string | null =>
  useSelectedFolder((state) => state.folder);

export const useSelectFolder = (): SelectedFolderState["selectFolder"] =>
  useSelectedFolder((state) => state.selectFolder);
