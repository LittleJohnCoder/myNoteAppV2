import type React from "react";

import { Toolbar } from "@/components/Toolbar/Toolbar";
import { cx } from "@/utils/cx";

export interface EditorPaneProps {
  selectedNoteId: string | null;
  draftFolder: string | null;
  readonly className?: string;
}

/**
 * Phase 4's editor pane is a placeholder: the layout has to exist for the sidebar to sit beside
 * something (SPEC §10.3), but the hybrid editor is Phase 5. It states what is selected so the
 * sidebar's selection is checkable on screen, and keeps the Phase 2 `#edit-probe` textarea — the
 * only editable target for the ⌘C/⌘V manual check until Phase 5's editor replaces it (T2).
 */
export const EditorPane: React.FC<EditorPaneProps> = ({
  selectedNoteId,
  draftFolder,
  className,
}) => (
  <section
    className={cx("editor", className)}
    id="editor-pane"
    aria-label="Editor"
    data-draft-folder={draftFolder ?? ""}
  >
    <Toolbar />
    <div className="editor__surface">
      <p className="editor__placeholder" id="editor-placeholder">
        {selectedNoteId
          ? `Selected note: ${selectedNoteId}`
          : "No note selected — the hybrid editor mounts here in Phase 5."}
      </p>
      <textarea
        id="edit-probe"
        className="editor__edit-probe"
        rows={1}
        aria-label="edit probe"
        placeholder="Phase 2 ⌘C/⌘V probe target"
      />
    </div>
  </section>
);
