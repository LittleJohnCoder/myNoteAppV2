import type React from "react";

import { cx } from "@/utils/cx";

import { useFolderContextMenuController } from "./FolderContextMenu.controller";

export interface FolderContextMenuProps {
  target: string;
  x: number;
  y: number;
  canDelete: boolean;
  onNewSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  readonly className?: string;
}

/**
 * SPEC §10.2's folder context menu: New Subfolder, Rename Folder, Delete Folder — the last one
 * only for a folder with no notes (SPEC §10.5). The two naming actions hand the work to the
 * sidebar's inline input rather than collecting a name here.
 *
 * `canDelete` is the renderer's count of notes, which is what §10.5 gates on; a folder holding
 * only non-note entries still reaches the layer and comes back `folder not empty`, which is the
 * layer's rule, not this menu's (§9.1).
 */
export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  target,
  x,
  y,
  canDelete,
  onNewSubfolder,
  onRename,
  onDelete,
  onClose,
  className,
}) => {
  const { menuRef, style } = useFolderContextMenuController({ x, y, onClose });

  return (
    <div
      ref={menuRef}
      id="folder-context-menu"
      className={cx("context-menu", className)}
      role="menu"
      aria-label={`Folder ${target}`}
      style={style}
      data-menu-target={target}
    >
      <p className="context-menu__target">{target}</p>
      <button
        type="button"
        role="menuitem"
        className="context-menu__item"
        onClick={onNewSubfolder}
      >
        New Subfolder
      </button>
      <button type="button" role="menuitem" className="context-menu__item" onClick={onRename}>
        Rename Folder
      </button>
      <button
        type="button"
        role="menuitem"
        className="context-menu__item context-menu__item_danger"
        title={canDelete ? undefined : "Only an empty folder can be deleted"}
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete Folder
      </button>
    </div>
  );
};
