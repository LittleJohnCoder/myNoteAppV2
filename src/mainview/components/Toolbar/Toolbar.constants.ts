/**
 * SPEC §10.1's toolbar actions, in the order they appear there. Phase 4 renders them disabled
 * (SPEC §10.5: "the toolbar renders its action buttons disabled with a tooltip") — Phase 7 wires
 * each one to the live editor view.
 */
export const TOOLBAR_ACTIONS = [
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "strikethrough", label: "Strikethrough" },
  { id: "heading-1", label: "H1" },
  { id: "heading-2", label: "H2" },
  { id: "heading-3", label: "H3" },
  { id: "bullet-list", label: "Bullet list" },
  { id: "numbered-list", label: "Numbered list" },
  { id: "task-list", label: "Task list" },
  { id: "quote", label: "Quote" },
  { id: "code", label: "Code" },
  { id: "link", label: "Link" },
  { id: "image", label: "Image" },
  { id: "table", label: "Table" },
  { id: "divider", label: "Divider" },
  { id: "math", label: "Math" },
  { id: "mermaid", label: "Mermaid" },
] as const;

export const PLACEHOLDER_TOOLTIP = "Formatting lands in Phase 7";
