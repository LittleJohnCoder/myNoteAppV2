import type React from "react";

import { FolderNameInput } from "@/components/FolderNameInput/FolderNameInput";
import { cx } from "@/utils/cx";

import { AllNotesRow } from "./AllNotesRow";
import type { FolderTreeController } from "./FolderTree.controller";
import type { FolderNameEntry } from "./FolderTree.types";
import { FolderTreeRow } from "./FolderTreeRow";

export interface FolderTreeProps {
  tree: FolderTreeController;
  nameEntry: FolderNameEntry | null;
  onSubmitName: (name: string) => void;
  onCancelName: () => void;
  readonly className?: string;
}

/**
 * The folder tree half of the sidebar (SPEC §10.2): the "All Notes" row, then the root's children
 * recursively. Every handler and every derived value comes from the tree controller; this file
 * only decides what the markup looks like (CODE_STYLE §5.4).
 */
export const FolderTree: React.FC<FolderTreeProps> = ({
  tree,
  nameEntry,
  onSubmitName,
  onCancelName,
  className,
}) => {
  const rootEntry = nameEntry?.mode === "create" && nameEntry.path === "" ? nameEntry : null;

  return (
    <nav
      className={cx("tree", className)}
      id="folder-tree"
      aria-label="Notebook folders"
      data-selected-folder={tree.selectedPath ?? ""}
    >
      <AllNotesRow tree={tree} />

      {rootEntry && (
        <FolderNameInput
          initialValue={rootEntry.initialValue}
          label="New folder in the notebook root"
          onSubmit={onSubmitName}
          onCancel={onCancelName}
        />
      )}

      <ul className="tree__children tree__children_root" role="tree">
        {tree.root.children.map((child) => (
          <FolderTreeRow
            key={child.path}
            node={child}
            depth={1}
            tree={tree}
            nameEntry={nameEntry}
            onSubmitName={onSubmitName}
            onCancelName={onCancelName}
          />
        ))}
      </ul>
    </nav>
  );
};
