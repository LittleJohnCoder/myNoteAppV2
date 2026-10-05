// SPEC §2 pins the dependency line: the hybrid package and the four CodeMirror peers. KaTeX is the
// one deliberate addition — the package renders math through `katex.renderToString` but ships no
// stylesheet and injects none (measured), and KaTeX's HTML is unusable without it. Declaring it (at
// the same version range the package asks for, so one copy is installed) is honest about a
// real dependency; importing the CSS from a transitive path would be a latent break.
import "katex/dist/katex.min.css";

import { EditorView } from "@codemirror/view";
import { hybridMarkdown } from "codemirror-markdown-hybrid";

import type { NoteTheme } from "@/store/theme";

import type { Extension } from "@codemirror/state";

/**
 * The editor's **one** composition (CODE_STYLE §8.1): the hybrid package's own bundle plus the two
 * extensions this app adds — the change listener that drives saving and the blur listener that
 * flushes it.
 *
 * What is deliberately *not* here, because `hybridMarkdown()` already includes it (measured against
 * `lib/index.js`, Phase 5): `markdown()` from `@codemirror/lang-markdown`, `history()`, the default
 * keymap, and line wrapping. Adding a second copy of any of them would put two languages/extensions
 * on the same state for no gain.
 *
 * SPEC §9.1: 500 ms while typing.
 */
export const SAVE_DEBOUNCE_MS = 500;

export interface EditorExtensionsOptions {
  theme: NoteTheme;
  /** A document change the user made — never the programmatic load of a note (§9.1's save points). */
  onChange: (view: EditorView) => void;
  /** The editor lost focus: flush whatever the debounce is still holding (§9.1, §10.5). */
  onBlur: () => void;
}

/**
 * `enableKeymap: false` is load-bearing, not tidiness: the package turns its markdown formatting
 * keybindings (Ctrl+B/I/K…) **on** by default, and this app is toolbar-only (SPEC §10.1). Phase 7's
 * "typing ⌘B does not insert bold" check is a check on this line.
 */
export const editorExtensions = ({
  theme,
  onChange,
  onBlur,
}: EditorExtensionsOptions): Extension[] => [
  hybridMarkdown({ theme, enablePreview: true, enableKeymap: false, enableCollapse: true }),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) onChange(update.view);
  }),
  EditorView.domEventHandlers({
    blur: () => {
      onBlur();
      return false;
    },
  }),
];
