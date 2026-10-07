import type React from "react";

import { cx } from "@/utils/cx";

import { PREVIEW_MODE_ACTION, TOOLBAR_ACTIONS } from "./Toolbar.constants";
import { useToolbarController } from "./Toolbar.controller";

import type { ToolbarControllerOptions } from "./Toolbar.types";

export interface ToolbarProps extends ToolbarControllerOptions {
  readonly className?: string;
}

/**
 * SPEC §10.3's toolbar: the shell's own component above the editor, with one button per action.
 *
 * Phase 4 rendered this list disabled with a placeholder tooltip; Phase 7 wires it. Two things the
 * markup has to get right, both pinned in §10.6 because the checks read them:
 *
 *   - every button carries `data-action` with its own id, so a check selects an action **by name** —
 *     a `textContent` match cannot tell `Code` from `Code block`;
 *   - the `disabled` **property** is on every button exactly while nothing is bound (§10.1's empty
 *     state), and the preview-mode button alone also carries `data-mode` and `aria-pressed`.
 */
export const Toolbar: React.FC<ToolbarProps> = ({ getView, isEnabled, className }) => {
  const { mode, previewTitle, handleAction } = useToolbarController({ getView, isEnabled });

  return (
    <div id="toolbar" className={cx("toolbar", className)} role="toolbar" aria-label="Formatting">
      {TOOLBAR_ACTIONS.map((action) => {
        const isPreviewMode = action.id === PREVIEW_MODE_ACTION;
        return (
          <button
            key={action.id}
            type="button"
            className="toolbar__button"
            data-action={action.id}
            data-mode={isPreviewMode ? mode : undefined}
            title={isPreviewMode ? previewTitle : undefined}
            aria-pressed={isPreviewMode ? mode === "raw" : undefined}
            disabled={!isEnabled}
            onClick={() => handleAction(action.id)}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
};
