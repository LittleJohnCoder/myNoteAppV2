import type React from "react";

import { cx } from "@/utils/cx";

import type { NoteMeta } from "../../../shared/types";
import { useNoteRowController } from "./NoteRow.controller";

export interface NoteRowProps {
  note: NoteMeta;
  active: boolean;
  onSelect: (id: string) => void;
  readonly className?: string;
}

/**
 * A notes-list row. `draggable` is what SPEC §10.5's native DnD hangs off; the drag payload is
 * written by the controller and read by `FolderTree` on drop.
 */
export const NoteRow: React.FC<NoteRowProps> = ({ note, active, onSelect, className }) => {
  const { label, preview, modified, activeClass, handleSelect, handleDragStart } =
    useNoteRowController({ note, active, onSelect });

  return (
    <li className="notes__item">
      <button
        type="button"
        className={cx("notes__row", activeClass, className)}
        data-note-id={note.id}
        draggable
        aria-current={active}
        onDragStart={handleDragStart}
        onClick={handleSelect}
      >
        <span className="notes__title">{label}</span>
        <span className="notes__meta">
          <span className="notes__modified">{modified}</span>
          {Boolean(preview) && <span className="notes__preview">{preview}</span>}
        </span>
      </button>
    </li>
  );
};
