import { useCallback, useMemo, useState } from "react";

import type { FolderTreeController } from "@/components/FolderTree/FolderTree.controller";
import { useFolderTreeController } from "@/components/FolderTree/FolderTree.controller";
import type { FolderNameEntry } from "@/components/FolderTree/FolderTree.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { createFolder, deleteFolder, moveNote, renameFolder } from "@/services/notes.service";
import { useClearDraft, useDraftFolder, useStartDraft } from "@/store/draftNote";
import { useSelectFolder, useSelectedFolderPath } from "@/store/selectedFolder";
import { useSelectNote, useSelectedNoteId } from "@/store/selectedNote";
import { errorMessage } from "@/utils/errorMessage";
import { noteCountsByFolder } from "@/utils/folderTree";
import { visibleNotes } from "@/utils/noteFilter";
import { rekeyFolderPath, rekeyId } from "@/utils/rekey";

import type { FolderNode, NoteMeta } from "../../../shared/types";

/** SPEC §10.5: ~150 ms. */
export const SEARCH_DEBOUNCE_MS = 150;

/** The context menu is open over exactly one folder, or closed. */
export type FolderMenuState =
  | { open: false }
  | { open: true; target: string; x: number; y: number };

/** Rendered before the first `getFolders` answers, so the tree hook has a shape to walk. */
const EMPTY_ROOT: FolderNode = { path: "", name: "Notebook", children: [] };

export interface SidebarOptions {
  root: FolderNode | null;
  notes: NoteMeta[];
  isLoading: boolean;
  loadError: string | null;
  /** Re-reads the tree and the list from the notes layer — the one source (CODE_STYLE §9.3). */
  onRefresh: () => Promise<void>;
}

export interface SidebarController {
  tree: FolderTreeController;
  query: string;
  isFiltered: boolean;
  visible: NoteMeta[];
  selectedFolderPath: string | null;
  selectedNoteId: string | null;
  draftFolder: string | null;
  menu: FolderMenuState;
  nameEntry: FolderNameEntry | null;
  canDeleteInMenu: boolean;
  isLoading: boolean;
  loadError: string | null;
  mutationError: string | null;
  handleQueryChange: (query: string) => void;
  handleSelectNote: (id: string) => void;
  handleStartDraft: () => void;
  handleOpenMenu: (path: string, x: number, y: number) => void;
  handleCloseMenu: () => void;
  handleNewSubfolder: () => void;
  handleRenameFolder: () => void;
  handleDeleteFolder: () => void;
  handleSubmitName: (name: string) => void;
  handleCancelName: () => void;
  handleDropNote: (noteId: string, folderPath: string) => void;
}

/**
 * The sidebar's logic: the search box, the folder tree's menu and inline name entry, and every
 * mutation Phase 4 owns (folders, and moving a note by drag). The notes and the tree themselves
 * are not held here — they come in as props from the shell, which owns the one copy
 * (CODE_STYLE §9.3), and every successful mutation ends in `onRefresh` rather than in local
 * bookkeeping.
 *
 * Selection *is* held in the stores, because it must outlive this component and be readable by
 * the editor pane: what changes here is only the re-keying, since a note's id is its path
 * (SPEC §9.1) and a folder rename re-ids everything below it (`changedIds`, SPEC §12).
 */
export const useSidebarController = (options: SidebarOptions): SidebarController => {
  const { root, notes, isLoading, loadError, onRefresh } = options;

  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<FolderMenuState>({ open: false });
  const [nameEntry, setNameEntry] = useState<FolderNameEntry | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const selectedFolderPath = useSelectedFolderPath();
  const selectFolder = useSelectFolder();
  const selectedNoteId = useSelectedNoteId();
  const selectNote = useSelectNote();
  const draftFolder = useDraftFolder();
  const startDraft = useStartDraft();
  const clearDraft = useClearDraft();

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const isFiltered = debouncedQuery.trim().length > 0;

  const counts = useMemo(() => noteCountsByFolder(notes), [notes]);
  const visible = useMemo(
    () => visibleNotes(notes, selectedFolderPath, debouncedQuery),
    [notes, selectedFolderPath, debouncedQuery],
  );

  /**
   * Every mutation goes through here: an expected failure (`ok: false` with the SPEC §9.1 error)
   * is shown and changes nothing, a refusal thrown by the bridge is caught, and only a success
   * triggers the re-keying and the re-read. A failed move therefore leaves the row where it was —
   * the list renders server truth, so "revert" needs no undo path.
   */
  const run = useCallback(
    async <R extends { ok: boolean; error?: string }>(
      action: () => Promise<R>,
      after?: (result: R) => void,
    ): Promise<void> => {
      try {
        const result = await action();
        if (!result.ok) {
          setMutationError(result.error ?? "The change was refused");
          return;
        }
        setMutationError(null);
        after?.(result);
        await onRefresh();
      } catch (error) {
        setMutationError(errorMessage(error));
      }
    },
    [onRefresh],
  );

  const handleQueryChange = useCallback((next: string): void => setQuery(next), []);

  const handleSelectNote = useCallback(
    (id: string): void => {
      // Selecting a note is one way to walk away from a draft (§10.5) — a draft has no file, so
      // clearing it is the whole cleanup.
      selectNote(id);
      clearDraft();
    },
    [selectNote, clearDraft],
  );

  const handleStartDraft = useCallback((): void => {
    // SPEC §10.5: the draft targets the selected folder, or the notebook root. It writes nothing.
    startDraft(selectedFolderPath ?? "");
  }, [startDraft, selectedFolderPath]);

  const handleOpenMenu = useCallback((path: string, x: number, y: number): void => {
    setMenu({ open: true, target: path, x, y });
  }, []);

  const handleCloseMenu = useCallback((): void => setMenu({ open: false }), []);

  const handleNewSubfolder = useCallback((): void => {
    if (!menu.open) return;
    setNameEntry({ mode: "create", path: menu.target, initialValue: "" });
    setMenu({ open: false });
  }, [menu]);

  const handleRenameFolder = useCallback((): void => {
    if (!menu.open) return;
    setNameEntry({
      mode: "rename",
      path: menu.target,
      initialValue: menu.target.split("/").at(-1) ?? menu.target,
    });
    setMenu({ open: false });
  }, [menu]);

  const handleDeleteFolder = useCallback((): void => {
    if (!menu.open) return;
    const target = menu.target;
    setMenu({ open: false });

    void run(
      () => deleteFolder(target),
      () => {
        // The folder is gone: a selection pointing into it would be a dead reference.
        if (selectedFolderPath === target) selectFolder(null);
      },
    );
  }, [menu, run, selectedFolderPath, selectFolder]);

  const handleCancelName = useCallback((): void => setNameEntry(null), []);

  const handleSubmitName = useCallback(
    (name: string): void => {
      const entry = nameEntry;
      if (!entry) return;
      setNameEntry(null);

      if (entry.mode === "create") {
        void run(() => createFolder(entry.path, name));
        return;
      }

      void run(
        () => renameFolder(entry.path, name),
        (result) => {
          const from = entry.path;
          const to = result.path;
          selectFolder(rekeyFolderPath(selectedFolderPath, from, to));
          selectNote(rekeyId(selectedNoteId, result.changedIds));
          // A draft only remembers a folder path. If that folder moved there is no id to re-key
          // from, so the draft is started over rather than aimed at a path that no longer exists.
          if (draftFolder !== null && rekeyFolderPath(draftFolder, from, to) !== draftFolder) {
            clearDraft();
          }
        },
      );
    },
    [nameEntry, run, selectedFolderPath, selectedNoteId, draftFolder, selectFolder, selectNote, clearDraft],
  );

  const handleDropNote = useCallback(
    (noteId: string, folderPath: string): void => {
      const note = notes.find((entry) => entry.id === noteId);
      if (!note) return;
      // SPEC §10.5: dropping a note on the folder it already lives in is a no-op — and calling the
      // layer would rewrite the file's mtime for nothing (§9.1).
      if (note.folder === folderPath) return;

      void run(
        () => moveNote(noteId, folderPath),
        (result) => {
          // The row stays selected, under its new id (SPEC §10.5).
          if (selectedNoteId === noteId) selectNote(result.newId);
        },
      );
    },
    [notes, run, selectedNoteId, selectNote],
  );

  const tree = useFolderTreeController({
    root: root ?? EMPTY_ROOT,
    counts,
    selectedPath: selectedFolderPath,
    onSelectFolder: selectFolder,
    onOpenMenu: handleOpenMenu,
    onDropNote: handleDropNote,
  });

  return {
    tree,
    query,
    isFiltered,
    visible,
    selectedFolderPath,
    selectedNoteId,
    draftFolder,
    menu,
    nameEntry,
    // SPEC §10.5 gates Delete Folder on the note count; a folder holding only non-note entries
    // still reaches the layer and answers `folder not empty` (§9.1).
    canDeleteInMenu: menu.open && (counts.get(menu.target) ?? 0) === 0,
    isLoading,
    loadError,
    mutationError,
    handleQueryChange,
    handleSelectNote,
    handleStartDraft,
    handleOpenMenu,
    handleCloseMenu,
    handleNewSubfolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleSubmitName,
    handleCancelName,
    handleDropNote,
  };
};
