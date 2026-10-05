/** SPEC §9.1: the notebook root's fixed name, and what the status bar shows for a root-level note. */
export const NOTEBOOK_LABEL = "Notebook";

/**
 * SPEC §10.3: the status bar's path field is `filename · folder`. The id **is** the path (§9.1), so
 * the last segment is the filename (without its `.md`) and everything before it is the folder —
 * `Ideas/2026/plan.md` → `plan · Ideas/2026`, and `plan.md` → `plan · Notebook`.
 */
export const noteLocation = (id: string): string => {
  const segments = id.split("/");
  const file = segments.at(-1) ?? "";
  const name = file.endsWith(".md") ? file.slice(0, -".md".length) : file;
  const folder = segments.slice(0, -1).join("/");
  return `${name} · ${folder.length > 0 ? folder : NOTEBOOK_LABEL}`;
};
