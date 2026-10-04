import type React from "react";

import { FolderNameInput } from "@/components/FolderNameInput/FolderNameInput";
import { cx } from "@/utils/cx";

import type { FolderNode } from "../../../shared/types";
import type { FolderTreeController } from "./FolderTree.controller";
import type { FolderNameEntry } from "./FolderTree.types";
import { useFolderTreeRowController } from "./FolderTreeRow.controller";

export interface FolderTreeRowProps {
  node: FolderNode;
  depth: number;
  tree: FolderTreeController;
  nameEntry: FolderNameEntry | null;
  onSubmitName: (name: string) => void;
  onCancelName: () => void;
  readonly className?: string;
}

/**
 * One folder row plus, recursively, its children. The row is two sibling `<button>`s — the twisty
 * and the label — rather than one clickable `<div>`, so nothing interactive is a container
 * (CODE_STYLE §5.6). The label is the drop target and carries the probe's data attributes.
 */
export const FolderTreeRow: React.FC<FolderTreeRowProps> = ({
  node,
  depth,
  tree,
  nameEntry,
  onSubmitName,
  onCancelName,
  className,
}) => {
  const {
    count,
    isExpanded,
    isSelected,
    isDropTarget,
    style,
    handleToggle,
    handleSelect,
    handleContextMenu,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFolderTreeRowController(node.path, depth, tree);

  const hasChildren = node.children.length > 0;
  const entry = nameEntry?.path === node.path ? nameEntry : null;

  return (
    <li className="tree__item">
      <div
        className={cx(
          "tree__row",
          isSelected && "tree__row_selected",
          isDropTarget && "tree__row_drop",
          className,
        )}
      >
        {hasChildren && (
          <button
            type="button"
            className="tree__twisty"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
            aria-expanded={isExpanded}
            onClick={handleToggle}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        )}
        <button
          type="button"
          className="tree__label"
          style={style}
          aria-current={isSelected}
          data-folder-path={node.path}
          data-folder-count={count}
          data-expanded={isExpanded}
          data-drop-zone="true"
          onClick={handleSelect}
          onContextMenu={handleContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="tree__name">{node.name}</span>
          <span className="tree__count">{count}</span>
        </button>
      </div>

      {entry && (
        <FolderNameInput
          initialValue={entry.initialValue}
          label={entry.mode === "rename" ? `Rename ${node.name}` : `New subfolder in ${node.name}`}
          onSubmit={onSubmitName}
          onCancel={onCancelName}
        />
      )}

      {isExpanded && hasChildren && (
        <ul className="tree__children" role="group">
          {node.children.map((child) => (
            <FolderTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              tree={tree}
              nameEntry={nameEntry}
              onSubmitName={onSubmitName}
              onCancelName={onCancelName}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
