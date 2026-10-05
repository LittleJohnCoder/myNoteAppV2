import { Electroview } from "electrobun/view";

import type { NoteChangedPayload, NotesRPC, ViewContextPayload } from "../shared/types";

/**
 * The webview half of the RPC bridge (SPEC §6, §15.5). This module owns the transport and
 * nothing else: incoming pushes fan out to subscribers instead of being handled here, and the
 * client it exports is the only thing outside `services/` that may touch it (CODE_STYLE §9.2).
 */

type NoteChangedListener = (change: NoteChangedPayload) => void;
type ViewContextListener = (context: ViewContextPayload) => void;

const noteChangedListeners = new Set<NoteChangedListener>();
const viewContextListeners = new Set<ViewContextListener>();

/**
 * The last context bun announced, replayed to a subscriber that arrives after it — the editor pane
 * asks for it from an effect, and a mount ordering that puts that effect after the push must not
 * silently lose the answer (the push itself is fire-and-forget, SPEC §15.21).
 */
let currentContext: ViewContextPayload | null = null;

const rpc = Electroview.defineRPC<NotesRPC>({
  maxRequestTime: 30_000,
  handlers: {
    // No requests are served here beyond the built-ins `Electroview.defineRPC` merges in
    // (`evaluateJavascriptWithResponse` — SPEC §15.22).
    requests: {},
    messages: {
      // SPEC §6 wires this sink as `console[level](msg)`. Deliberate deviation from CODE_STYLE §15
      // ("only console.error"): the sink *is* the spec'd handler, and both levels go to stderr.
      logToWebview: ({ level, msg }) => console[level](msg),
      noteChanged: (change) => {
        for (const listener of noteChangedListeners) listener(change);
      },
      viewContext: (context) => {
        currentContext = context;
        for (const listener of viewContextListeners) listener(context);
      },
    },
  },
});

export const electroview = new Electroview({ rpc });

/**
 * SPEC §6 writes this as `electroview.rpc.request`; taken from the local binding instead
 * because `Electroview.rpc` is optional and would need a non-null assertion.
 */
export const notes = rpc.request;

/** Subscribe to the bun → view change push. Returns the unsubscribe function (effect cleanup). */
export const onNoteChanged = (listener: NoteChangedListener): (() => void) => {
  noteChangedListeners.add(listener);
  return () => {
    noteChangedListeners.delete(listener);
  };
};

/**
 * Subscribe to bun's announcement of which channel this window is running in (SPEC §7's
 * `viewContext`). It arrives right after the view announces itself, so a subscriber registered in
 * the same mount gets it — and one that registers later gets the remembered value immediately.
 */
export const onViewContext = (listener: ViewContextListener): (() => void) => {
  viewContextListeners.add(listener);
  if (currentContext) listener(currentContext);
  return () => {
    viewContextListeners.delete(listener);
  };
};

let hasAnnounced = false;

/**
 * The handshake: bun does not push until it hears this, because a fire-and-forget send that
 * races the view's socket is dropped. Idempotent — the shell mounts twice under StrictMode.
 */
export const announceViewReady = (url: string): void => {
  if (hasAnnounced) return;
  hasAnnounced = true;
  electroview.rpc?.send.viewReady({ url });
};
