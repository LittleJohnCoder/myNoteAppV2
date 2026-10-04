import { useCallback } from "react";

import type { NoteMeta } from "../../../shared/types";

export interface NotesPanelOptions {
  /** Already scoped to the selected folder and filtered by the search query. */
  notes: NoteMeta[];
  selectedNoteId: string | null;
  isLoading: boolean;
  /** Whether a filter is active, which is the only way "no rows" can mean two different things. */
  isFiltered: boolean;
  onSelectNote: (id: string) => void;
}

export interface NotesPanelController {
  notes: NoteMeta[];
  selectedNoteId: string | null;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  handleSelectNote: (id: string) => void;
}

/** SPEC §10.2's notes list: the rows, which one is active, and what an empty list means. */
export const useNotesPanelController = ({
  notes,
  selectedNoteId,
  isLoading,
  isFiltered,
  onSelectNote,
}: NotesPanelOptions): NotesPanelController => {
  const handleSelectNote = useCallback(
    (id: string): void => onSelectNote(id),
    [onSelectNote],
  );

  return {
    notes,
    selectedNoteId,
    isLoading,
    isEmpty: !isLoading && notes.length === 0,
    emptyLabel: isFiltered ? "No notes match this search." : "No notes here yet.",
    handleSelectNote,
  };
};
