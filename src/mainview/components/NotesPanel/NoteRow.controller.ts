import type { DragEvent } from "react";
import { useMemo } from "react";

import { setNoteDragData } from "@/utils/noteDrag";
import { truncateSnippet } from "@/utils/truncateSnippet";

import type { NoteMeta } from "../../../shared/types";

export interface NoteRowController {
  label: string;
  preview: string;
  modified: string;
  activeClass: string;
  handleSelect: () => void;
  handleDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}

export interface NoteRowOptions {
  note: NoteMeta;
  active: boolean;
  onSelect: (id: string) => void;
}

/** One notes-list row: title, modified date, 60-char preview (SPEC §10.2). */
export const useNoteRowController = ({
  note,
  active,
  onSelect,
}: NoteRowOptions): NoteRowController => {
  const preview = useMemo(() => truncateSnippet(note.preview, 60), [note.preview]);

  return {
    label: note.title,
    preview,
    modified: new Date(note.updatedAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    activeClass: active ? "notes__row_active" : "",
    handleSelect: () => onSelect(note.id),
    handleDragStart: (event) => setNoteDragData(event.dataTransfer, note),
  };
};
