import { useEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";

export interface FolderContextMenuOptions {
  x: number;
  y: number;
  onClose: () => void;
}

export interface FolderContextMenuController {
  menuRef: RefObject<HTMLDivElement>;
  style: CSSProperties;
}

/**
 * The menu is a transient overlay, so closing it is an effect on the document: a pointerdown
 * outside it and an Escape anywhere both dismiss it, and both are cleaned up on unmount
 * (CODE_STYLE §7.3). Positioning stays in CSS via the two custom properties (§11.6).
 */
export const useFolderContextMenuController = ({
  x,
  y,
  onClose,
}: FolderContextMenuOptions): FolderContextMenuController => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return { menuRef, style: { "--menu-x": `${x}px`, "--menu-y": `${y}px` } as CSSProperties };
};
