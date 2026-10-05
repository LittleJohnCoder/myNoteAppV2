/**
 * SPEC §10.1: the title field is constrained to the slug charset **as it is typed** — letters and
 * digits, lowercased — so the field always shows exactly what `createNote` will store (§9.1).
 *
 * The layer's own slug rule also strips a trailing `.md` *before* dropping characters, and that
 * step cannot be mirrored here: the suffix only exists once its last character is typed, so a live
 * field would delete characters as they are entered. A pasted `notes.md` therefore becomes the name
 * `notesmd` — the punctuation is dropped, so the file is `notesmd.md`, which is what the field
 * showed. Everything else about the two rules agrees: no symbols, spaces included.
 */
export const TITLE_CHARSET_INVALID = /[^a-z0-9]/g;

export const toTitleCharset = (value: string): string =>
  value.toLowerCase().replace(TITLE_CHARSET_INVALID, "");
