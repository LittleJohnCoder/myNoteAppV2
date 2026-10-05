import type React from "react";

import { cx } from "@/utils/cx";

import { useStatusBarController } from "./StatusBar.controller";

export interface StatusBarProps {
  readonly className?: string;
}

/**
 * SPEC §10.3's status bar: word count, line count and `filename · folder`, all from the open note.
 * The theme toggle lives here (§10.5). The `data-*` attributes duplicate what is rendered so a check
 * can read the value without parsing the label; `data-theme-value` is read by nothing and goes in
 * Phase 8 (§10.6).
 */
export const StatusBar: React.FC<StatusBarProps> = ({ className }) => {
  const { theme, toggleLabel, words, lines, location, handleToggleTheme } =
    useStatusBarController();

  return (
    <footer
      className={cx("status-bar", className)}
      id="status-bar"
      data-theme-value={theme}
      data-words={words}
      data-lines={lines}
      data-location={location}
    >
      <span className="status-bar__field">Words: {words}</span>
      <span className="status-bar__field">Lines: {lines}</span>
      <span className="status-bar__field status-bar__location">{location}</span>
      <button
        id="theme-toggle"
        type="button"
        className="status-bar__toggle"
        aria-pressed={theme === "dark"}
        title={toggleLabel}
        onClick={handleToggleTheme}
      >
        {toggleLabel}
      </button>
    </footer>
  );
};
