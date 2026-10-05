import type React from "react";

import { cx } from "@/utils/cx";

import { useTitleInputController } from "./TitleInput.controller";

export interface TitleInputProps {
  value: string;
  /** SPEC §10.1: creation-only in the MVP — once the note exists, editing it would be a rename. */
  isReadOnly: boolean;
  /** The draft token: a second `+` re-focuses the field even in the same folder. `null` = no draft. */
  focusToken: number | null;
  onChange: (value: string) => void;
  onCommit: (options: { moveToBody: boolean }) => void;
  readonly className?: string;
}

/**
 * SPEC §10.1's title field: a single-line input above the body, not part of the markdown and not
 * written into the file. `readOnly` (not `disabled`) once the note exists, so it still reads and
 * selects but cannot be typed into.
 */
export const TitleInput: React.FC<TitleInputProps> = ({
  value,
  isReadOnly,
  focusToken,
  onChange,
  onCommit,
  className,
}) => {
  const { inputRef, placeholder, handleChange, handleKeyDown, handleBlur } =
    useTitleInputController({ focusToken, onChange, onCommit });

  return (
    <input
      id="title-input"
      ref={inputRef}
      className={cx("editor__title", className)}
      type="text"
      value={value}
      readOnly={isReadOnly}
      placeholder={placeholder}
      aria-label="Note title"
      autoComplete="off"
      spellCheck={false}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
};
