import { create } from "zustand";

/**
 * SPEC §10.5: the active note, as a plain `id` — Phase 5 opens this. It is a plain id rather than
 * a tagged union because a draft has no id yet, and that is what `draftNote` is for.
 *
 * Ids are paths (§9.1), so a move or a folder rename changes this value: whoever performs the
 * mutation re-keys it from `moveNote`'s `newId` / `renameFolder`'s `changedIds`.
 */
export interface SelectedNoteState {
  id: string | null;
  selectNote: (id: string | null) => void;
}

export const useSelectedNote = create<SelectedNoteState>((set) => ({
  id: null,
  selectNote: (id) => set({ id }),
}));

export const useSelectedNoteId = (): string | null => useSelectedNote((state) => state.id);

export const useSelectNote = (): SelectedNoteState["selectNote"] =>
  useSelectedNote((state) => state.selectNote);
