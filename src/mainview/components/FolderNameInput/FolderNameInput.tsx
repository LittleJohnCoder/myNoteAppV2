import type React from "react";

import { cx } from "@/utils/cx";

import { useFolderNameInputController } from "./FolderNameInput.controller";

export interface FolderNameInputProps {
  initialValue: string;
  label: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  readonly className?: string;
}

/** Rendered by the tree directly under the folder it names (D3 — inline, never a native prompt). */
export const FolderNameInput: React.FC<FolderNameInputProps> = ({
  initialValue,
  label,
  onSubmit,
  onCancel,
  className,
}) => {
  const { value, handleChange, handleKeyDown, handleBlur } = useFolderNameInputController({
    initialValue,
    onSubmit,
    onCancel,
  });

  return (
    <input
      id="folder-name-input"
      type="text"
      className={cx("tree__name-input", className)}
      aria-label={label}
      placeholder="Folder name"
      value={value}
      autoFocus
      onChange={(event) => handleChange(event.target.value)}
      onKeyDown={(event) => handleKeyDown(event.key)}
      onBlur={handleBlur}
    />
  );
};
