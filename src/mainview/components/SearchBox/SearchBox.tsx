import type React from "react";

import { cx } from "@/utils/cx";

export interface SearchBoxProps {
  value: string;
  onChange: (query: string) => void;
  readonly className?: string;
}

/**
 * The notes-list filter (SPEC §10.2, §10.5). Controlled by the sidebar's controller, which owns
 * the query — so the box can be unmounted (a folder switch re-renders the tree) without losing
 * what the user typed. No controller of its own: a controlled input has no logic to isolate
 * (CODE_STYLE §6.3).
 */
export const SearchBox: React.FC<SearchBoxProps> = ({ value, onChange, className }) => (
  <input
    id="search-input"
    type="search"
    className={cx("search", className)}
    placeholder="Search notes…"
    aria-label="Search notes by title or text"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);
