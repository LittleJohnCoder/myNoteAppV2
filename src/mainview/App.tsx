import type React from "react";

import { EditorPane } from "@/components/EditorPane/EditorPane";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { StatusBar } from "@/components/StatusBar/StatusBar";

import { useAppController } from "./App.controller";

// Bump this whenever a fresh renderer build has to be proven to have reached the window: seeing
// the new value, or grepping it out of `dist/`, rules out a stale copy chain (Phase 1 lesson).
export const SHELL_MARKER = "phase-5";

/**
 * The shell: sidebar, editor pane, status bar (SPEC §10.3). It owns no logic of its own — it
 * renders the spacing and hands the controller's notebook data to the two panes.
 *
 * The `data-*` attributes on `main` are the dev probe's read surface (todo.md Phase 4's DOM
 * checks): the selection and the draft are not always visible on screen — a draft is invisible by
 * design (§10.5) — so the probe reads them here rather than guessing from pixels.
 */
const App: React.FC = () => {
  const {
    root,
    notes,
    isLoading,
    loadError,
    refresh,
    selectedFolderPath,
    selectedNoteId,
    draftFolder,
  } = useAppController();

  return (
    <main
      className="shell"
      id="shell"
      data-shell-marker={SHELL_MARKER}
      data-selected-folder={selectedFolderPath ?? ""}
      data-selected-note={selectedNoteId ?? ""}
      data-draft-folder={draftFolder ?? ""}
    >
      <div className="shell__body">
        <Sidebar
          root={root}
          notes={notes}
          isLoading={isLoading}
          loadError={loadError}
          onRefresh={refresh}
        />
        <EditorPane />
      </div>
      <StatusBar />
    </main>
  );
};

export default App;
