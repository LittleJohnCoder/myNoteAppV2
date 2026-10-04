import type { CSSProperties, DragEvent, MouseEvent } from "react";

import { carriesNoteDrag, droppedNoteId } from "@/utils/noteDrag";

import type { FolderTreeController } from "./FolderTree.controller";

export interface FolderTreeRowController {
  count: number;
  isExpanded: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  style: CSSProperties;
  handleToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  handleSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  handleContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  handleDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLButtonElement>) => void;
  handleDrop: (event: DragEvent<HTMLButtonElement>) => void;
}

/**
 * One folder row's derived values and handlers. `path` is the row's folder path (`""` = the
 * notebook root, rendered as the "All Notes" row).
 */
export const useFolderTreeRowController = (
  path: string,
  depth: number,
  tree: FolderTreeController,
): FolderTreeRowController => {
  const isDropTarget = tree.dragOverPath === path;

  const handleDragOver = (event: DragEvent<HTMLButtonElement>): void => {
    // A drop is only possible if the default is prevented during `dragover`.
    if (!carriesNoteDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    tree.dragOverFolder(path);
  };

  const handleDragLeave = (): void => {
    if (isDropTarget) tree.dragOverFolder(null);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const noteId = droppedNoteId(event.dataTransfer);
    if (!noteId) return;
    tree.dropOnFolder(path, noteId);
  };

  return {
    count: tree.countOf(path),
    isExpanded: tree.isExpanded(path),
    isSelected: tree.selectedPath === path,
    isDropTarget,
    // Layout stays in CSS (§11.6): the row only states its depth.
    style: { "--row-depth": depth } as CSSProperties,
    handleToggle: () => tree.toggleFolder(path),
    handleSelect: () => tree.selectFolder(path),
    handleContextMenu: (event) => {
      event.preventDefault();
      tree.openMenu(path, event.clientX, event.clientY);
    },
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
