import type { FolderNode } from "../../shared/types";

/**
 * Depth-first list of every folder path under `root` (the root itself excluded), so a flat list
 * can show the shape of a nested tree. Pure, no I/O — Phase 4's `FolderTree` builds on this.
 */
export const flattenFolderPaths = (root: FolderNode): string[] => {
  const paths: string[] = [];

  const walk = (node: FolderNode): void => {
    for (const child of node.children) {
      paths.push(child.path);
      walk(child);
    }
  };

  walk(root);
  return paths;
};
