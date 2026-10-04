import { ApplicationMenu, BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { NotesRPC } from "../shared/types";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  listAllNotes,
  moveNote,
  readFolderTree,
  readNote,
  renameFolder,
  writeNote,
} from "./notes";
import { runPhase4Probe } from "./phase4Probe";
import { runPhase3Smoke } from "./smoke";

// Keep in step with vite.config.ts `server.port`.
const DEV_SERVER_URL = "http://localhost:5173";

/**
 * SPEC §9, §15.9: writable app data lives under `Utils.paths.userData` — never next to the
 * bundle, and never in `views/` (that is build output). Created recursively at boot, before a
 * handler can be asked for it. Sync-free I/O throughout: the main process event loop also
 * drives the window.
 */
export const NOTEBOOK_DIR = join(Utils.paths.userData, "notebook");
await mkdir(NOTEBOOK_DIR, { recursive: true });

/**
 * SPEC §15.7: in dev, prefer the Vite dev server when it is actually up so `dev:hmr` gives HMR;
 * otherwise fall back to the built view. Probing with a request — rather than trusting the
 * channel flag alone — is what keeps plain `bun start` working with no dev server running.
 */
async function resolveViewUrl(channel: string): Promise<string> {
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`[bun] view: Vite dev server at ${DEV_SERVER_URL} (HMR)`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "[bun] view: no Vite dev server — using the built bundle (see `bun run dev:hmr`)",
      );
    }
  }
  return "views://mainview/index.html";
}

const channel = await Updater.localInfo.channel();
const viewUrl = await resolveViewUrl(channel);

/**
 * SPEC §5, §15.8: clipboard/undo/select-all reach the webview only through the application
 * menu — the webview has no edit accelerators of its own. Roles are unvalidated strings and an
 * unknown one is dropped silently (§15.23), so the ⌘C/⌘V/⌘Z check in todo.md Phase 2 is the
 * real test of this block. Labels are omitted deliberately: `ApplicationMenu` fills them from
 * the role.
 */
ApplicationMenu.setApplicationMenu([
  { label: "Notes", submenu: [{ role: "quit" }] },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

/**
 * The ten handlers are one **named object**, not an inline literal (SPEC §5). It is the only
 * handle on them — what `defineRPC` returns exposes `setTransport`/`request`/`send`/… but no
 * read-back of the handler map — so the Phase 3 smoke drives this object directly, with no
 * round trip. Typed from the schema, so a missing, extra or misnamed method is a compile error.
 */
type NotesRequests = NotesRPC["bun"]["requests"];
export type NotesHandlers = {
  [M in keyof NotesRequests]: (
    params: NotesRequests[M]["params"],
  ) => Promise<NotesRequests[M]["response"]>;
};

const notesHandlers: NotesHandlers = {
  // Handlers stay one-liners: the notes layer returns the §7 envelopes itself (§9.1), so there
  // is no error plumbing to duplicate here.
  getAllNotes: async () => listAllNotes(NOTEBOOK_DIR),
  getFolders: async () => readFolderTree(NOTEBOOK_DIR),
  openNote: async ({ id }) => readNote(NOTEBOOK_DIR, id),
  saveNote: async ({ id, content }) => writeNote(NOTEBOOK_DIR, id, content),
  createNote: async ({ folder, title }) => createNote(NOTEBOOK_DIR, folder, title),
  deleteNote: async ({ id }) => deleteNote(NOTEBOOK_DIR, id),
  createFolder: async ({ parent, name }) => createFolder(NOTEBOOK_DIR, parent, name),
  deleteFolder: async ({ path }) => deleteFolder(NOTEBOOK_DIR, path),
  moveNote: async ({ id, targetFolder }) => moveNote(NOTEBOOK_DIR, id, targetFolder),
  renameFolder: async ({ path, name }) => renameFolder(NOTEBOOK_DIR, path, name),
};

const notesRPC = BrowserView.defineRPC<NotesRPC>({
  maxRequestTime: 10_000,
  handlers: {
    requests: notesHandlers,
    messages: {
      // The view telling us it is up. Everything bun pushes waits for this.
      viewReady: (payload) => {
        void handleViewReady(payload);
      },
    },
  },
});

console.log("[bun] main process up — opening the Notes window");

const mainWindow = new BrowserWindow({
  title: "Notes",
  url: viewUrl,
  rpc: notesRPC, // attaches the bun half of the bridge to the window's webview
  frame: { width: 1100, height: 750, x: 120, y: 80 },
});

console.log("[bun] window created", { id: mainWindow.id });

// Phase 1 verification surface: "dom-ready" fires once the view has loaded a document, so its
// absence is a real signal that the view/copy chain broke (SPEC §8).
mainWindow.webview.on("dom-ready", () => {
  console.log(`[bun] webview dom-ready — ${viewUrl} loaded`);
});

/**
 * The Phase 3 boot smoke (todo.md): dev only, and temporary. It drives the notes-layer barrel
 * (checks 1–13) and this file's handler map (checks 14–17) against the real `NOTEBOOK_DIR`, so the
 * wiring is proven, not assumed. Its promise is awaited before the Phase 4 probe starts — both
 * seed the same notebook, and the smoke asserts *exact* id sets.
 */
const phase3Done =
  channel === "dev"
    ? runPhase3Smoke({ dir: NOTEBOOK_DIR, handlers: notesHandlers })
    : Promise.resolve();

let hasHandshaked = false;

/**
 * Runs once per launch, after the view reports itself ready. This is the half of the bridge a
 * round trip cannot exercise on its own (SPEC §15.21: the two message directions live in
 * different schema halves), so in dev it hands the live view to the Phase 4 DOM probe.
 *
 * The probe drives the real UI from the bun side — the Phase 2 push-and-read proof retired with
 * the placeholder shell it proved (todo.md Phase 4): the view now renders the real notebook, and
 * what the probe reads is the app.
 */
async function handleViewReady({ url }: { url: string }): Promise<void> {
  if (hasHandshaked) return; // React StrictMode mounts the shell twice in dev
  hasHandshaked = true;

  console.log(`[bun] view ready — ${url}`);

  // `BrowserView` fills `rpc` in itself for a webview created without one (it defines an empty
  // RPC half), so it is always set by the time the view can talk to us — guard, don't assert.
  const { rpc } = mainWindow.webview;
  if (!rpc) {
    console.error(
      "[bun] view is ready but the webview has no RPC half — the Phase 4 probe is skipped",
    );
    return;
  }

  rpc.send.logToWebview({
    level: "info",
    msg: `bun received viewReady from ${url}`,
  });

  if (channel !== "dev") return;

  await phase3Done;

  await runPhase4Probe({
    dir: NOTEBOOK_DIR,
    evaluate: (script) => rpc.request.evaluateJavascriptWithResponse({ script }),
    pushNoteChanged: (id, updatedAt) => rpc.send.noteChanged({ id, updatedAt }),
  });
}
