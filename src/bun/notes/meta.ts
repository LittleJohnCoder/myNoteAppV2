import type { NoteMeta } from "../../shared/types";
import { folderOfId, nameOfId } from "./paths";

/**
 * Pure derivations shared by the walk (`tree.ts`), `read.ts` and `write.ts` — no I/O, so every
 * rule in SPEC §9.1 that decides *what a note looks like* is testable without a filesystem.
 */

export const PREVIEW_LENGTH = 60;
/** The fallback slug **and** the title of a note with neither a name nor an H1 (SPEC §9.1). */
export const DEFAULT_SLUG = "untitled";

/** `*.md`, compared case-insensitively (SPEC §9.1). */
export const isMarkdown = (fileName: string): boolean => fileName.toLowerCase().endsWith(".md");

/** The filename without its `.md` extension — the fallback title (SPEC §9.1). */
export const stemOf = (fileName: string): string => fileName.replace(/\.md$/i, "");

/**
 * The §9.1 title regex: the first ATX H1 anywhere in the body, its optional closing hashes
 * dropped. Auxiliary — it only decides the title of a note whose name was skipped. No code-fence
 * parsing — a `# x` inside a fence can win if it comes first.
 */
const ATX_H1 = /^#\s+(.+?)\s*#*\s*$/m;

/**
 * A stem matching this was produced by the §9.1 slug fallback, i.e. the note was created without a
 * title, which is what sends it to the body for one. Everything else is a name and wins.
 */
const NO_TITLE_STEM = /^untitled\d*$/;

/**
 * SPEC §9.1: the note's **name** — its filename stem — wins; the first ATX H1 is the auxiliary
 * fallback, used only when the title was skipped at creation; no H1 either ⇒ `untitled`. So a note
 * created as `plan.md` is titled `plan` whatever its body says.
 */
export const deriveTitle = (body: string, fileName: string): string => {
  const stem = stemOf(fileName);
  if (!NO_TITLE_STEM.test(stem)) return stem;

  const match = ATX_H1.exec(body);
  return match ? match[1].trim() : DEFAULT_SLUG;
};

/**
 * The raw first 60 characters of the body with every whitespace run collapsed to a single space
 * (SPEC §9.1). The H1 line is part of the body and is not stripped; no `…` is appended — that is
 * the renderer's business.
 */
export const derivePreview = (body: string): string =>
  body.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH);

/**
 * Slug for a new note's filename (SPEC §9.1). Titles are alphanumeric: lowercase, strip a trailing
 * `.md`, then drop every character outside `[a-z0-9]` — no symbols, spaces included. Empty →
 * `untitled`. The `.md` strip runs *before* the drop so `notes.md` becomes `notes`, not `notesmd`.
 */
export const slugifyTitle = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]/g, "");
  return slug === "" ? DEFAULT_SLUG : slug;
};

/** The `NoteMeta` every reader derives — one source so the walk and `readNote` never disagree. */
export const buildNoteMeta = (id: string, body: string, updatedAt: number): NoteMeta => ({
  id,
  title: deriveTitle(body, nameOfId(id)),
  folder: folderOfId(id),
  updatedAt,
  preview: derivePreview(body),
});
