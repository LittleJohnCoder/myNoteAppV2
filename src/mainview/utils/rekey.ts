import type { RenamedId } from "../../shared/types";

/**
 * A note's `id` is its path (SPEC §9.1), so a folder rename re-ids every note below it. The
 * renderer must follow — the selection and any open editor would otherwise point at a file that no
 * longer exists under that name — and `renameFolder`'s `changedIds` is the only correct source for
 * the new spelling (SPEC §12).
 */
export const rekeyId = (id: string | null, changedIds: RenamedId[]): string | null => {
  if (id === null) return null;
  return changedIds.find((change) => change.from === id)?.to ?? id;
};

/**
 * The same re-key for a *folder* path: the selected folder itself may have been renamed, or be a
 * descendant of the renamed one. `from`/`to` come from the `renameFolder` call, not from a note
 * map, because a folder with no notes below it answers `changedIds: []`.
 */
export const rekeyFolderPath = (
  path: string | null,
  from: string,
  to: string,
): string | null => {
  if (path === null) return null;
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return path;
};
