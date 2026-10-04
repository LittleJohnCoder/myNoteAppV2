import { useCallback, useEffect, useState } from "react";

import { announceViewReady, onNoteChanged } from "@/rpc";
import { getAllNotes, getFolders } from "@/services/notes.service";
import { useDraftFolder } from "@/store/draftNote";
import { useSelectedFolderPath } from "@/store/selectedFolder";
import { useSelectedNoteId } from "@/store/selectedNote";
import { useNoteTheme } from "@/store/theme";
import { errorMessage } from "@/utils/errorMessage";

import type { FolderNode, NoteMeta } from "../shared/types";

export interface AppController {
  root: FolderNode | null;
  notes: NoteMeta[];
  isLoading: boolean;
  loadError: string | null;
  selectedFolderPath: string | null;
  selectedNoteId: string | null;
  draftFolder: string | null;
  theme: string;
  refresh: () => Promise<void>;
}

/**
 * The shell's logic, and the **one** owner of the notebook's data (CODE_STYLE §9.3): the tree and
 * the notes list are read here and passed down, so the sidebar and (in Phase 5) the editor cannot
 * drift apart. Every mutation elsewhere ends in `refresh()` rather than in a local edit.
 *
 * Three effects, each synchronising with something outside React (CODE_STYLE §7.3): the initial
 * read, the bun → view push, and the theme.
 */
export const useAppController = (): AppController => {
  const [root, setRoot] = useState<FolderNode | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const selectedFolderPath = useSelectedFolderPath();
  const selectedNoteId = useSelectedNoteId();
  const draftFolder = useDraftFolder();
  const theme = useNoteTheme();

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [tree, list] = await Promise.all([getFolders(), getAllNotes()]);
      setRoot(tree);
      setNotes(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // SPEC §10.5: a note changed on disk (this app or another) is a re-read, not a patch. The
    // handshake first — a bun → view send that races the view's socket is dropped (§15.21).
    const unsubscribe = onNoteChanged(() => {
      void refresh();
    });
    announceViewReady(window.location.href);

    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    // SPEC §10.5 / CODE_STYLE §11.3: the theme store is the single source of truth and this effect
    // is the only writer of `data-theme`; no component ever asks what the theme is.
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return {
    root,
    notes,
    isLoading: !hasLoaded,
    loadError,
    selectedFolderPath,
    selectedNoteId,
    draftFolder,
    theme,
    refresh,
  };
};
