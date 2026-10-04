import { useState } from "react";

export interface FolderNameInputController {
  value: string;
  canSubmit: boolean;
  handleChange: (value: string) => void;
  handleKeyDown: (key: string) => void;
  handleBlur: () => void;
}

export interface FolderNameInputOptions {
  initialValue: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The inline name entry for New Subfolder / Rename Folder (D3). Enter commits, Escape cancels, and
 * blur commits a non-empty name — leaving the field empty is a cancel, which is SPEC §10.5's "walk
 * away from a draft and nothing is written" rule applied to folders.
 *
 * No validation beyond emptiness: a name is verbatim, not slugged (§9.1), and the layer owns the
 * real rules (`invalid name`, `already exists`) which surface as the returned envelope.
 */
export const useFolderNameInputController = ({
  initialValue,
  onSubmit,
  onCancel,
}: FolderNameInputOptions): FolderNameInputController => {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  const handleKeyDown = (key: string): void => {
    if (key === "Enter" && trimmed) onSubmit(trimmed);
    if (key === "Escape") onCancel();
  };

  const handleBlur = (): void => {
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return {
    value,
    canSubmit: Boolean(trimmed),
    handleChange: setValue,
    handleKeyDown,
    handleBlur,
  };
};
