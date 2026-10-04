import type React from "react";

import { cx } from "@/utils/cx";

import { PLACEHOLDER_TOOLTIP, TOOLBAR_ACTIONS } from "./Toolbar.constants";

export interface ToolbarProps {
  readonly className?: string;
}

/**
 * SPEC §10.5: in Phase 4 the toolbar is a placeholder — every action is a real `<button>`
 * (CODE_STYLE §5.6) rendered disabled with a tooltip. Phase 7 replaces this with the wired
 * `EditorToolbar.controller.ts`. No controller here: a static list has no logic to isolate (§6.3).
 */
export const Toolbar: React.FC<ToolbarProps> = ({ className }) => (
  <div className={cx("toolbar", className)} role="toolbar" aria-label="Formatting">
    {TOOLBAR_ACTIONS.map((action) => (
      <button
        key={action.id}
        type="button"
        className="toolbar__button"
        title={PLACEHOLDER_TOOLTIP}
        disabled
      >
        {action.label}
      </button>
    ))}
  </div>
);
