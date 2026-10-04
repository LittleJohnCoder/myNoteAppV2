import type React from "react";

import { cx } from "@/utils/cx";

import type { FolderTreeController } from "./FolderTree.controller";
import { useFolderTreeRowController } from "./FolderTreeRow.controller";

export interface AllNotesRowProps {
  tree: FolderTreeController;
}

/**
 * SPEC §10.5: the root is not a folder you can rename or delete, so it gets its own row rather
 * than a `FolderTreeRow` — it is `null` (no selection = "All Notes"), it is the drop target that
 * means "move to the notebook root", and it has no context menu.
 */
export const AllNotesRow: React.FC<AllNotesRowProps> = ({ tree }) => {
  const { count, isSelected, isDropTarget, style, handleSelect, handleDragOver, handleDragLeave, handleDrop } =
    useFolderTreeRowController("", 0, tree);

  return (
    <div
      className={cx(
        "tree__row",
        "tree__row_root",
        isSelected && "tree__row_selected",
        isDropTarget && "tree__row_drop",
      )}
    >
      <button
        id="all-notes"
        type="button"
        className="tree__label"
        style={style}
        aria-current={isSelected}
        data-folder-path=""
        data-folder-count={count}
        data-drop-zone="true"
        onClick={handleSelect}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="tree__name">All Notes</span>
        <span className="tree__count">{count}</span>
      </button>
    </div>
  );
};
