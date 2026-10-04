import type { FolderNode, NoteMeta } from "../../shared/types";

/**
 * Every folder path a note's `folder` sits inside, root first: `"Ideas/2026"` →
 * `["", "Ideas", "Ideas/2026"]`. SPEC §10.5's counts are recursive, so a count is the sum over
 * exactly this chain. The root is `""` (§9.1), and it is always in the chain.
 */
export const ancestorFolderPaths = (folder: string): string[] => {
  const paths = [""];
  if (!folder) return paths;

  const segments = folder.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    paths.push(segments.slice(0, index + 1).join("/"));
  }
  return paths;
};

/**
 * Recursive note count per folder path (SPEC §10.5) — a folder counts its whole subtree, so
 * `counts.get("")` is `getAllNotes().length`. `FolderNode` carries no count field on purpose: the
 * renderer derives it from the list it already has, rather than adding a tenth RPC method.
 */
export const noteCountsByFolder = (
  notes: NoteMeta[],
): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const note of notes) {
    for (const path of ancestorFolderPaths(note.folder)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
};
