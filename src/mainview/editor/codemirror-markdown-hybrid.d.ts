/**
 * Hand-written declarations for `codemirror-markdown-hybrid@1.2.2`.
 *
 * The package ships **no types**: its `package.json` points `types` at `./dist/index.d.ts`, which
 * is not in the published tarball (measured in Phase 5 — `dist/` holds only `.js`/`.cjs` chunks).
 * Its real surface is the readable source under `lib/`, which is where every signature below was
 * taken from, so the type gate can still fail on a wrong call instead of silently accepting `any`.
 *
 * Only what the app actually uses is declared. `actions` carries the package's own key names
 * (`lib/extensions/actions.js`) because Phase 7's toolbar dispatches against that map.
 */
declare module "codemirror-markdown-hybrid" {
  import type { Extension } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";

  export type HybridMarkdownTheme = "light" | "dark";
  export type HybridMarkdownMode = "hybrid" | "raw";

  export interface HybridMarkdownOptions {
    enablePreview?: boolean;
    enableKeymap?: boolean;
    enableCollapse?: boolean;
    theme?: HybridMarkdownTheme;
  }

  /**
   * The one composition entry point. It already includes `@codemirror/lang-markdown`'s `markdown()`,
   * `history()`, the default keymap, line wrapping and the theme — so it must not be composed with
   * a second copy of those (SPEC §2, §10.1).
   */
  export function hybridMarkdown(options?: HybridMarkdownOptions): Extension[];

  export function toggleTheme(view: EditorView): boolean;
  export function toggleHybridMode(view: EditorView): boolean;
  export function setTheme(view: EditorView, theme: HybridMarkdownTheme): void;
  export function setMode(view: EditorView, mode: HybridMarkdownMode): void;
  export function getTheme(view: EditorView): HybridMarkdownTheme;
  export function getMode(view: EditorView): HybridMarkdownMode;

  /** `bold`, `italic`, `strikethrough`, `h1`–`h3`, `link`, `image`, `bulletList`, `numberedList`,
   *  `taskList`, `inlineCode`, `codeBlock`, `hr`, `quote`, `table`, `diagram`, `emoji`. */
  export const actions: Record<string, (view: EditorView) => void>;

  export const hybridPreview: (options?: { enableCollapse?: boolean }) => Extension;
  export const markdownKeymap: Extension;
  export const highlightSelectedLines: Extension;
  export const lightTheme: Extension;
  export const darkTheme: Extension;
  export const baseTheme: Extension;
}
