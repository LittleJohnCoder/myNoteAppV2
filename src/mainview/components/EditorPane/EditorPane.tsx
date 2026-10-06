import type React from "react";

import { TitleInput } from "@/components/TitleInput/TitleInput";
import { Toolbar } from "@/components/Toolbar/Toolbar";
import { cx } from "@/utils/cx";

import { useEditorPaneController } from "./EditorPane.controller";

export interface EditorPaneProps {
  readonly className?: string;
}

/**
 * The editor pane (SPEC §10.1, §10.3): the title field, the hybrid editor's host, and the pane's
 * state as data attributes for the probes.
 *
 * It takes **no props**: the pane's subject is whichever note the stores say is open, and the
 * document itself lives inside the editor (CODE_STYLE §8.5), so the component is a frame around a
 * controller. The state a check needs is therefore on the element — `data-note-id` and
 * `data-dirty` — because neither is visible on screen.
 *
 * The Phase 2 `#edit-probe` textarea is gone: from here the editor's body is the editable target
 * for the ⌘C/⌘V/⌘Z manual check (SPEC §10.6).
 */
export const EditorPane: React.FC<EditorPaneProps> = ({ className }) => {
  const {
    hostRef,
    title,
    isTitleReadOnly,
    focusToken,
    isDraft,
    isDirty,
    noteId,
    hasDocument,
    error,
    handleTitleChange,
    handleCommitTitle,
  } = useEditorPaneController();

  return (
    <section
      className={cx("editor", className)}
      id="editor-pane"
      aria-label="Editor"
      data-note-id={noteId ?? ""}
      data-dirty={isDirty ? "true" : "false"}
      data-draft={isDraft ? "true" : "false"}
      data-body-visible={hasDocument ? "true" : "false"}
    >
      <Toolbar />
      {hasDocument && (
        <TitleInput
          value={title}
          isReadOnly={isTitleReadOnly}
          focusToken={focusToken}
          onChange={handleTitleChange}
          onCommit={handleCommitTitle}
        />
      )}
      <div className="editor__surface">
        {!hasDocument && (
          <p className="editor__placeholder" id="editor-placeholder">
            No note open — choose one from the list, or press + to start a new note.
          </p>
        )}
        {/*
          Mounted always, hidden when there is nothing to edit. Unmounting it would destroy the
          CodeMirror view — the controller creates it once, into this element — so the pane would
          have no editor when a note opens later. `display: none` keeps the instance alive, takes the
          field out of sight and out of the tab order, and closes a measured hole: with the body
          visible in the empty state, keystrokes were ignored by the controller and silently
          discarded (2026-10-06) — a field that looked usable and could not hold anything.
        */}
        <div
          className={cx("editor__host", !hasDocument && "editor__host_hidden")}
          ref={hostRef}
          data-editor-host="true"
        />
      </div>
      {error && (
        <p className="editor__error" id="editor-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};
