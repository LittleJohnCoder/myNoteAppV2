/**
 * The two ids the package has no action for (SPEC §10.1, §10.6). Every other id in the list below
 * **is** a key of the package's own `actions` map, so there is exactly one vocabulary for the
 * actions and no id→action table that can drift out of step with it.
 */
export const MATH_ACTION = "math";
export const PREVIEW_MODE_ACTION = "preview-mode";

/**
 * The toolbar's actions, in SPEC §10.1's order, with the spec's own words as labels.
 *
 * The ids are the package's action keys — `hr` is the Divider button, `diagram` is Mermaid,
 * `inlineCode` is Code — plus the two above; `ToolbarActionId` is derived from this list, and
 * `PackageActionKey` in the module declaration is what fails the type gate if one of them is not a
 * real action. The package's `emoji` action is deliberately unused — the spec's toolbar list has
 * never had an emoji button.
 */
export const TOOLBAR_ACTIONS = [
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "strikethrough", label: "Strikethrough" },
  { id: "h1", label: "H1" },
  { id: "h2", label: "H2" },
  { id: "h3", label: "H3" },
  { id: "bulletList", label: "Bullet list" },
  { id: "numberedList", label: "Numbered list" },
  { id: "taskList", label: "Task list" },
  { id: "quote", label: "Quote" },
  { id: "inlineCode", label: "Code" },
  { id: "codeBlock", label: "Code block" },
  { id: "link", label: "Link" },
  { id: "image", label: "Image" },
  { id: "table", label: "Table" },
  { id: "hr", label: "Divider" },
  { id: MATH_ACTION, label: "Math" },
  { id: "diagram", label: "Mermaid" },
  { id: PREVIEW_MODE_ACTION, label: "Preview" },
] as const;
