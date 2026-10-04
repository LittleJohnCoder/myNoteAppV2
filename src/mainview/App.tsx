import type React from "react";

// Rename this marker and re-run `bun start`: seeing the new value in the window proves
// the Vite -> dist/ -> views/mainview/ copy chain is live, not inferred (Phase 1).
export const SHELL_MARKER = "phase-1";

const App: React.FC = () => (
  <main className="shell">
    <header className="shell__header">
      <h1 className="shell__title">Notes</h1>
      <p className="shell__meta">myNoteAppV2 · Electrobun v1 shell · {SHELL_MARKER}</p>
    </header>
    <p className="shell__note">
      Placeholder shell. The folder tree, notes list, hybrid editor and toolbar land in
      later phases (see todo.md).
    </p>
  </main>
);

export default App;
