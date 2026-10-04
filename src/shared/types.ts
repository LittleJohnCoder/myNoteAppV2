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
 * House-style note: SPEC §7 writes `NoteMeta`/`FolderNode` as `type` aliases; CODE_STYLE §4.1
 * requires `interface` for object shapes and its own worked example is this very type. The
 * shapes are byte-for-byte SPEC §7 — only the declaration keyword differs.
 */

export interface NoteMeta {
  id: string; // notebook-relative path id, e.g. "work/ideas.md"
  title: string;
  folder: string; // notebook-relative folder path, "" for the root
  updatedAt: number; // epoch ms
  preview: string; // first ~60 chars of the body
  content?: string; // only populated by openNote
}

export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

export type NotesRPC = {
  bun: RPCSchema<{
    requests: {
      getAllNotes: { params: {}; response: NoteMeta[] };
      getFolders: { params: {}; response: FolderNode };
      openNote: { params: { id: string }; response: NoteMeta | null };
      saveNote: {
        params: { id: string; content: string };
        response: { ok: boolean; updatedAt: number };
      };
      createNote: { params: { folder: string; title: string }; response: NoteMeta };
      deleteNote: { params: { id: string }; response: { ok: boolean } };
      createFolder: {
        params: { parent: string; name: string };
        response: { ok: boolean; path: string };
      };
      deleteFolder: { params: { path: string }; response: { ok: boolean; error?: string } };
      moveNote: {
        params: { id: string; targetFolder: string };
        response: { ok: boolean; newId: string };
      };
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
       * (SPEC §15.22). It is the app's "read the live DOM from bun" channel; not part of SPEC §7.
       */
      evaluateJavascriptWithResponse: { params: { script: string }; response: unknown };
    };
    messages: {
      logToWebview: { level: "info" | "error"; msg: string };
      noteChanged: { id: string; updatedAt: number }; // bun → view push
    };
  }>;
};

/**
 * Payloads derived from the schema instead of hand-retyped (§4.3) — the schema above stays the
 * single source of truth for what an incoming push looks like.
 */
export type NoteChangedPayload = NotesRPC["webview"]["messages"]["noteChanged"];
