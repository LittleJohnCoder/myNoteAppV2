import { BrowserWindow } from "electrobun/bun";

// Phase 1: the shell only — a native window whose content is served over the views://
// protocol (never file://). RPC, the application menu and the notebook directory are
// Phase 2 (SPEC §5).

console.log("[bun] main process up — opening the Notes window");

const mainWindow = new BrowserWindow({
  title: "Notes",
  url: "views://mainview/index.html",
  frame: { width: 1100, height: 750, x: 120, y: 80 },
});

console.log("[bun] window created", { id: mainWindow.id });

// Phase 1 verification surface: "dom-ready" fires only once the view has loaded the
// document at views://mainview/index.html, so its absence is a real signal that the
// Vite -> dist/ -> views/mainview/ chain broke (SPEC §8).
mainWindow.webview.on("dom-ready", () => {
  console.log("[bun] webview dom-ready — views://mainview/index.html loaded");
});
