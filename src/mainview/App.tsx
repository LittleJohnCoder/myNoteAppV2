import type React from "react";

import { useAppController } from "./App.controller";

// Bump this whenever a fresh renderer build has to be proven to have reached the window: seeing
// the new value, or grepping it out of `dist/`, rules out a stale copy chain (Phase 1 lesson).
export const SHELL_MARKER = "phase-2";

const App: React.FC = () => {
  const { folders, isLoading, loadError, rootLabel, folderPaths, lastChangeLabel } =
    useAppController();

  return (
    <main className="shell">
      <header className="shell__header">
        <h1 className="shell__title">Notes</h1>
        <p className="shell__meta">myNoteAppV2 · Electrobun v1 shell · {SHELL_MARKER}</p>
      </header>

      <section className="shell__panel">
        <h2 className="shell__panel-title">Bridge proof — stub data (Phase 2)</h2>
        {Boolean(loadError) && <p className="shell__error">getFolders failed: {loadError}</p>}
        {isLoading && <p className="shell__note">Waiting for getFolders…</p>}
        {folders && (
          <p className="shell__note">
            getFolders returned &quot;{rootLabel}&quot; — {folderPaths.length} folder(s) below it.
          </p>
        )}
        <ul className="shell__list">
          {folderPaths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        {/*
          TEMPORARY Phase-2 probe: the shell has no editable element yet, so the Edit-menu
          accelerators (⌘C/⌘V/⌘Z) have nowhere to land. Its job is done — the Phase 2 check
          passed by hand (⌘C + repeated ⌘V landed, see todo.md) — but keep it until Phase 5's
          editor exists, since there is still no other editable target for a manual check.
        */}
        <textarea id="edit-probe" className="shell__edit-probe" rows={1} aria-label="edit probe" />
        {/*
          The bun → view push, rendered. The main process reads this element's text back through
          the view-served `evaluateJavascriptWithResponse` request to prove the push landed in the
          window — hence the stable id.
        */}
        <p className="shell__proof" id="bridge-proof">
          {lastChangeLabel ?? "no noteChanged push received yet"}
        </p>
      </section>

      <p className="shell__note">
        Placeholder shell. The folder tree, notes list, hybrid editor and toolbar land in later
        phases (see todo.md).
      </p>
    </main>
  );
};

export default App;
