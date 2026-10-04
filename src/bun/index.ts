import { BrowserWindow, Updater } from "electrobun/bun";

// Phase 1: the shell only — a native window whose content is served over the views://
// protocol (never file://). RPC, the application menu and the notebook directory are
// Phase 2 (SPEC §5).

// Keep in step with vite.config.ts `server.port`.
const DEV_SERVER_URL = "http://localhost:5173";

// SPEC §15.7: in dev, prefer the Vite dev server when it is actually up so `dev:hmr` gives
// HMR; otherwise fall back to the built view. Probing with a request (rather than trusting a
// flag) is what lets plain `bun start` keep working with no dev server running.
async function resolveViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`[bun] view: Vite dev server at ${DEV_SERVER_URL} (HMR)`);
      return DEV_SERVER_URL;
    } catch {
      console.log("[bun] view: no Vite dev server — using the built bundle (see `bun run dev:hmr`)");
    }
  }
  return "views://mainview/index.html";
}

const viewUrl = await resolveViewUrl();

console.log("[bun] main process up — opening the Notes window");

const mainWindow = new BrowserWindow({
  title: "Notes",
  url: viewUrl,
  frame: { width: 1100, height: 750, x: 120, y: 80 },
});

console.log("[bun] window created", { id: mainWindow.id });

// Phase 1 verification surface: "dom-ready" fires only once the view has loaded its document,
// so its absence is a real signal that the view/copy chain broke (SPEC §8).
mainWindow.webview.on("dom-ready", () => {
  console.log(`[bun] webview dom-ready — ${viewUrl} loaded`);
});
