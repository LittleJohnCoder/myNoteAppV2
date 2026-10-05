import type { RPCSchema } from "electrobun/bun";

/**
 * The RPC contract (SPEC §7), declared **once** and imported by both halves — the bun main
 * process and the webview. `RPCSchema` is a type-only import from the bun half, so it erases at
 * compile time and the renderer can import this module without pulling bun code into the view
 * bundle (SPEC §15.5, §15.14).
 *
 * Each half names the side that **handles** it (SPEC §15.21): `bun.messages` are messages bun
 * receives (view → bun), `webview.messages` are messages the view receives (bun → view).
 *
 * Reads (`getAllNotes`, `getFolders`, `openNote`) return data, using `null` for an absent note.
 * Every mutation returns a `MutationResult` envelope carrying `error?` — expected failures are
 * **returned, not thrown** (SPEC §9.1), so callers never wrap a call in try/catch to learn why
 * something did not happen.
 *
 * House-style note: SPEC §7 writes these shapes as `type` aliases; CODE_STYLE §4.1 requires
 * `interface` for object shapes and its own worked example is this very type. The shapes are
 * field-for-field SPEC §7 — only the declaration keyword differs.
 */

export interface NoteMeta {
  id: string; // notebook-relative path id incl. ".md", e.g. "work/ideas.md" (SPEC §9.1)
  title: string; // the note's name (its filename stem); the first H1 is only the fallback (SPEC §9.1)
  folder: string; // notebook-relative folder path, "" for the root
  updatedAt: number; // epoch ms, from the file mtime — the list's sort key (SPEC §9.1)
  preview: string; // first 60 chars of the body, whitespace runs collapsed (SPEC §9.1)
  content?: string; // only populated by openNote
}

export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

/** The envelope every mutating method answers with (SPEC §7, §9.1). */
export interface MutationResult {
  ok: boolean;
  error?: string; // one of §9.1's strings, e.g. "not found" / "invalid id" / "folder not empty"
}

export interface SaveNoteResult extends MutationResult {
  updatedAt: number;
}

export interface CreateNoteResult extends MutationResult {
  note?: NoteMeta; // the created note, so the renderer never has to guess the slugged id
}

export interface CreateFolderResult extends MutationResult {
  path: string;
}

export interface MoveNoteResult extends MutationResult {
  newId: string; // the id after the move — ids ARE paths
}

export interface RenamedId {
  from: string;
  to: string;
}

export interface RenameFolderResult extends MutationResult {
  path: string;
  /** Empty when no note sits below the renamed folder. Every id below it changed (SPEC §12). */
  changedIds: RenamedId[];
}

export type NotesRPC = {
  bun: RPCSchema<{
    requests: {
      getAllNotes: { params: {}; response: NoteMeta[] };
      getFolders: { params: {}; response: FolderNode };
      openNote: { params: { id: string }; response: NoteMeta | null };
      saveNote: { params: { id: string; content: string }; response: SaveNoteResult };
      createNote: { params: { folder: string; title: string }; response: CreateNoteResult };
      deleteNote: { params: { id: string }; response: MutationResult };
      createFolder: { params: { parent: string; name: string }; response: CreateFolderResult };
      deleteFolder: { params: { path: string }; response: MutationResult };
      moveNote: { params: { id: string; targetFolder: string }; response: MoveNoteResult };
      renameFolder: { params: { path: string; name: string }; response: RenameFolderResult };
    };
    messages: {
      /**
       * Sent by the view once it is mounted and listening. The handshake exists because bun →
       * view pushes are fire-and-forget: a push sent before the view's socket is up is simply
       * dropped, so the main process has to wait to be told the view is there.
       */
      viewReady: { url: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      /**
       * Served by the view itself: `Electroview.defineRPC` merges this built-in in (it runs the
       * script through `new Function` and returns its value). Declaring it here is what makes it
       * callable from bun **with types** — the built-in is not merged into the bun-side types
       * (SPEC §15.22). It is the app's "read the live DOM from bun" channel.
       */
      evaluateJavascriptWithResponse: { params: { script: string }; response: unknown };
    };
    messages: {
      logToWebview: { level: "info" | "error"; msg: string };
      /**
       * bun → view. Sent after every successful `saveNote`/`createNote` (SPEC §9.1); the view may
       * ignore the echo of its own write. delete/move/rename are deliberately not covered — the
       * view initiated those and re-reads the tree itself.
       */
      noteChanged: { id: string; updatedAt: number };
      /**
       * bun → view, right after the handshake: which channel this window is running in. It exists
       * because the renderer's **only** channel signal is otherwise the built bundle's environment
       * — `import.meta.env.DEV` is false in exactly the run the dev probe uses (`bun start` loads
       * the built view), so the dev-only editor handle needs the answer from the side that knows it
       * (SPEC §10.1, §15.7).
       */
      viewContext: { channel: string };
    };
  }>;
};

/**
 * Payloads derived from the schema instead of hand-retyped — the schema above stays the single
 * source of truth for what an incoming push looks like.
 */
export type NoteChangedPayload = NotesRPC["webview"]["messages"]["noteChanged"];
export type ViewContextPayload = NotesRPC["webview"]["messages"]["viewContext"];
