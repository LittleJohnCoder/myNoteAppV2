import { useCallback, useEffect, useRef } from "react";

import { toTitleCharset } from "@/utils/titleCharset";

import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

/** SPEC §10.1: `Untitled` is a **placeholder**, never content. */
export const TITLE_PLACEHOLDER = "Untitled";

export interface TitleInputOptions {
  focusToken: number | null;
  onChange: (value: string) => void;
  onCommit: (options: { moveToBody: boolean }) => void;
}

export interface TitleInputController {
  inputRef: RefObject<HTMLInputElement>;
  placeholder: string;
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
}

export const useTitleInputController = ({
  focusToken,
  onChange,
  onCommit,
}: TitleInputOptions): TitleInputController => {
  const inputRef = useRef<HTMLInputElement>(null);

  // SPEC §10.1: `+` puts the caret in the title field. Keyed on the draft token rather than on
  // "is a draft", so starting a second draft in the same folder focuses the field again.
  useEffect(() => {
    if (focusToken === null) return;
    inputRef.current?.focus();
  }, [focusToken]);

  /** The field constrains what it accepts, so what is shown is what will be stored (§9.1, §10.1). */
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => onChange(toTitleCharset(event.target.value)),
    [onChange],
  );

  /**
   * Enter, Tab and blur commit **identically** (SPEC §10.5); Enter and Tab additionally continue
   * into the body, which is why their default is prevented rather than the keys being ignored. Blur
   * must not move the caret back — the user clicked somewhere else on purpose.
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      event.preventDefault();
      onCommit({ moveToBody: true });
    },
    [onCommit],
  );

  const handleBlur = useCallback((): void => onCommit({ moveToBody: false }), [onCommit]);

  return { inputRef, placeholder: TITLE_PLACEHOLDER, handleChange, handleKeyDown, handleBlur };
};
