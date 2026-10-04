import type { NoteMeta } from "../../shared/types";

/**
 * A note's `id` **is** its notebook-relative path (SPEC §9.1), so subtree membership is a path
 * question: a note is in `folder` when its id sits directly in it or below it. The root (`""`) is
 * every note, which is what `null` = "All Notes" means in the store (SPEC §10.5).
 *
 * The trailing separator matters: `"Docs2/x.md"` is not inside `"Docs"`.
 */
export const isInSubtree = (id: string, folder: string): boolean =>
  folder === "" || id.startsWith(`${folder}/`);

/** SPEC §10.5's scope half: the list shows the selected folder's subtree, or everything. */
export const scopeNotes = (notes: NoteMeta[], folder: string | null): NoteMeta[] => {
  if (folder === null) return notes;
  return notes.filter((note) => isInSubtree(note.id, folder));
};

/**
 * SPEC §10.5's search: a case-insensitive substring over `title` + `preview`. Both are searched
 * because a note's title is only its filename stem (§9.1) — the preview is often the only place
 * the user's words appear. An empty query is not a filter.
 */
export const filterNotes = (notes: NoteMeta[], query: string): NoteMeta[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;

  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(needle) ||
      note.preview.toLowerCase().includes(needle),
  );
};

/** The list's full derivation: scope first, then search. */
export const visibleNotes = (
  notes: NoteMeta[],
  folder: string | null,
  query: string,
): NoteMeta[] => filterNotes(scopeNotes(notes, folder), query);
