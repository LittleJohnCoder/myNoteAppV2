import type React from "react";

import { FolderContextMenu } from "@/components/FolderContextMenu/FolderContextMenu";
import { FolderTree } from "@/components/FolderTree/FolderTree";
import { NotesPanel } from "@/components/NotesPanel/NotesPanel";
import { SearchBox } from "@/components/SearchBox/SearchBox";
import { cx } from "@/utils/cx";

import type { FolderNode, NoteMeta } from "../../../shared/types";
import { useSidebarController } from "./Sidebar.controller";

export interface SidebarProps {
  root: FolderNode | null;
  notes: NoteMeta[];
  isLoading: boolean;
  loadError: string | null;
  onRefresh: () => Promise<void>;
  readonly className?: string;
}

/**
 * SPEC §10.2's sidebar: search, the folder tree (with its context menu and inline name entry), the
 * notes list and the `+` button. The shell owns the notebook data; this component is handed it and
 * hands back `onRefresh`-driven updates.
 *
 * The `+` writes nothing (SPEC §10.5), and a draft is invisible here by design — it shows up in
 * Phase 5 as the editor's title input. The shell exposes it to the dev probe as `data-draft-folder`
 * rather than drawing a row that is not a note.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  root,
  notes,
  isLoading,
  loadError,
  onRefresh,
  className,
}) => {
  const {
    tree,
    query,
    isFiltered,
    visible,
    selectedNoteId,
    draftFolder,
    menu,
    nameEntry,
    canDeleteInMenu,
    mutationError,
    handleQueryChange,
    handleSelectNote,
    handleStartDraft,
    handleCloseMenu,
    handleNewSubfolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleSubmitName,
    handleCancelName,
  } = useSidebarController({ root, notes, isLoading, loadError, onRefresh });

  return (
    <aside
      className={cx("sidebar", className)}
      id="sidebar"
      aria-label="Notebook"
      data-draft-folder={draftFolder ?? ""}
    >
      <header className="sidebar__header">
        <h1 className="sidebar__title">Notes</h1>
        <button
          id="new-note"
          type="button"
          className="sidebar__new"
          title="New note"
          aria-label="New note"
          onClick={handleStartDraft}
        >
          +
        </button>
      </header>

      <SearchBox value={query} onChange={handleQueryChange} />

      {Boolean(loadError) && (
        <p className="sidebar__error" id="load-error">
          Loading the notebook failed: {loadError}
        </p>
      )}
      {Boolean(mutationError) && (
        <p className="sidebar__error" id="mutation-error">
          {mutationError}
        </p>
      )}

      <FolderTree
        tree={tree}
        nameEntry={nameEntry}
        onSubmitName={handleSubmitName}
        onCancelName={handleCancelName}
      />

      <NotesPanel
        notes={visible}
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        isFiltered={isFiltered}
        onSelectNote={handleSelectNote}
      />

      {menu.open && (
        <FolderContextMenu
          target={menu.target}
          x={menu.x}
          y={menu.y}
          canDelete={canDeleteInMenu}
          onNewSubfolder={handleNewSubfolder}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
          onClose={handleCloseMenu}
        />
      )}
    </aside>
  );
};
