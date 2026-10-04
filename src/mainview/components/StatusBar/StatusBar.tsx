import type React from "react";

import { cx } from "@/utils/cx";

import { useStatusBarController } from "./StatusBar.controller";

export interface StatusBarProps {
  readonly className?: string;
}

/** SPEC §10.3's status bar. Word/line/path land in Phase 5; the theme toggle lives here (D2). */
export const StatusBar: React.FC<StatusBarProps> = ({ className }) => {
  const { theme, toggleLabel, words, lines, location, handleToggleTheme } =
    useStatusBarController();

  return (
    <footer className={cx("status-bar", className)} id="status-bar" data-theme-value={theme}>
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
