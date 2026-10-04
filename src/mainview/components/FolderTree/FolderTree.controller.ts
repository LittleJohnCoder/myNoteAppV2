import { useCallback, useState } from "react";

import type { FolderNode } from "../../../shared/types";
import { ancestorFolderPaths } from "@/utils/folderTree";

export interface FolderTreeOptions {
  root: FolderNode;
  counts: Map<string, number>;
  selectedPath: string | null;
  onSelectFolder: (path: string | null) => void;
  onOpenMenu: (path: string, x: number, y: number) => void;
  onDropNote: (noteId: string, folderPath: string) => void;
}

export interface FolderTreeController {
  root: FolderNode;
  counts: Map<string, number>;
  selectedPath: string | null;
  dragOverPath: string | null;
  countOf: (path: string) => number;
  isExpanded: (path: string) => boolean;
  toggleFolder: (path: string) => void;
  selectFolder: (path: string) => void;
  openMenu: (path: string, x: number, y: number) => void;
  dragOverFolder: (path: string | null) => void;
  dropOnFolder: (path: string, noteId: string) => void;
}

/**
 * The tree's own state and handlers. Expand/collapse is component-local and keyed by folder path
 * — never persisted, root expanded, nothing auto-collapsing (SPEC §10.5). Selection is not held
 * here: it is the store's, so the notes list and the tree cannot disagree.
 */
export const useFolderTreeController = (options: FolderTreeOptions): FolderTreeController => {
  const { root, counts, selectedPath, onSelectFolder, onOpenMenu, onDropNote } = options;
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set([""]));
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const countOf = useCallback((path: string): number => counts.get(path) ?? 0, [counts]);

  const isExpanded = useCallback(
    (path: string): boolean => expandedPaths.has(path),
    [expandedPaths],
  );

  const toggleFolder = useCallback((path: string): void => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectFolder = useCallback(
    (path: string): void => {
      // Selecting expands the folder's ancestors (SPEC §10.5); the folder itself is toggled by its
      // own twisty, so selecting never collapses anything.
      setExpandedPaths((previous) => new Set([...previous, ...ancestorFolderPaths(path)]));
      onSelectFolder(path === "" ? null : path);
    },
    [onSelectFolder],
  );

  const openMenu = useCallback(
    (path: string, x: number, y: number): void => onOpenMenu(path, x, y),
    [onOpenMenu],
  );

  const dragOverFolder = useCallback((path: string | null): void => setDragOverPath(path), []);

  const dropOnFolder = useCallback(
    (path: string, noteId: string): void => {
      setDragOverPath(null);
      onDropNote(noteId, path);
    },
    [onDropNote],
  );

  return {
    root,
    counts,
    selectedPath,
    dragOverPath,
    countOf,
    isExpanded,
    toggleFolder,
    selectFolder,
    openMenu,
    dragOverFolder,
    dropOnFolder,
  };
};
