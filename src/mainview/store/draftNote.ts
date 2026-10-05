import { create } from "zustand";

/**
 * SPEC §10.5's `+`: a new note that has no file yet. The draft carries only the folder it will be
 * created in — it is deliberately *not* a note id, because nothing exists on disk.
 *
 * It writes nothing: committing a title (or the first body save) is what calls `createNote`, and
 * walking away from a draft leaves no file behind (§10.5). Drafts are invisible to the sidebar,
 * so no component lists this — the shell reads it.
 */
export interface DraftNoteState {
  folder: string;
  id: number;
  startDraft: (folder: string) => void;
  clearDraft: () => void;
}

/**
 * `id` is a monotonic token, not a note id: it lets a consumer tell one draft from the next (the
 * same folder started twice), which a `{ folder }`-only state cannot express.
 */
export const useDraftNote = create<DraftNoteState>((set) => ({
  folder: "",
  id: 0,
  startDraft: (folder) => set((state) => ({ folder, id: state.id + 1 })),
  clearDraft: () => set({ id: 0 }),
}));

/** `null` when there is no draft; otherwise its folder (SPEC §10.5's `{ folder } | null`). */
export const useDraftFolder = (): string | null => useDraftNote((state) => (state.id ? state.folder : null));

/**
 * The draft's identity token, exposed for the editor pane's title field: it must re-focus when the
 * user presses `+` again in the same folder, which "a draft exists" cannot express (§10.5).
 */
export const useDraftToken = (): number => useDraftNote((state) => state.id);

export const useStartDraft = (): DraftNoteState["startDraft"] =>
  useDraftNote((state) => state.startDraft);

export const useClearDraft = (): DraftNoteState["clearDraft"] =>
  useDraftNote((state) => state.clearDraft);
