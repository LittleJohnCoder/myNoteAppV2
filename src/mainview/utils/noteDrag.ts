import type { NoteMeta } from "../../shared/types";

/**
 * The note-drag contract between the two sides that never meet in the DOM: `NotesPanel` writes the
 * note id on `dragstart`, `FolderTree` reads it on `drop` (SPEC §10.5's native HTML5 DnD). A shared
 * module rather than a copied literal — a typo'd media type would surface only as a silently
 * ignored drop.
 */
export const NOTE_DRAG_TYPE = "application/x-note-id";

export const setNoteDragData = (dataTransfer: DataTransfer, note: NoteMeta): void => {
  dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
  // Some webviews refuse a drag that carries only a custom media type; `text/plain` keeps it valid.
  dataTransfer.setData("text/plain", note.id);
  dataTransfer.effectAllowed = "move";
};

/** True when a drag in progress actually carries one of our notes (not a file, not stray text). */
export const carriesNoteDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes(NOTE_DRAG_TYPE);

/** The note id a drop carries, or `""` when the drop is not ours. */
export const droppedNoteId = (dataTransfer: DataTransfer): string =>
  dataTransfer.getData(NOTE_DRAG_TYPE);
