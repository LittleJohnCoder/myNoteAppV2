import type React from "react";

import { Loading } from "@/components/Loading/Loading";
import { cx } from "@/utils/cx";

import { NoteRow } from "./NoteRow";
import { useNotesPanelController } from "./NotesPanel.controller";
import type { NoteMeta } from "../../../shared/types";

export interface NotesPanelProps {
  notes: NoteMeta[];
  selectedNoteId: string | null;
  isLoading: boolean;
  isFiltered: boolean;
  onSelectNote: (id: string) => void;
  readonly className?: string;
}

/** SPEC §10.2's notes list. The filtering happens above it; this only renders what it is given. */
export const NotesPanel: React.FC<NotesPanelProps> = ({
  notes,
  selectedNoteId,
  isLoading,
  isFiltered,
  onSelectNote,
  className,
}) => {
  const { isEmpty, emptyLabel, handleSelectNote } = useNotesPanelController({
    notes,
    selectedNoteId,
    isLoading,
    isFiltered,
    onSelectNote,
  });

  return (
    <Loading isLoading={isLoading} className="notes__loading">
      <ul className={cx("notes", className)} id="notes-list" data-note-count={notes.length}>
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            active={note.id === selectedNoteId}
            onSelect={handleSelectNote}
          />
        ))}
      </ul>
      {isEmpty && (
        <p className="notes__empty" id="notes-empty">
          {emptyLabel}
        </p>
      )}
    </Loading>
  );
};
