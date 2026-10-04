/**
 * The inline rename/new-subfolder entry (D3): the sidebar owns this state, the tree renders it.
 *
 * `path` is the folder the input belongs to — the parent for a `create`, the folder itself for a
 * `rename` — and the input always renders directly under that folder's row.
 */
export interface FolderNameEntry {
  mode: "create" | "rename";
  path: string;
  initialValue: string;
}
