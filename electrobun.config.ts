import type { ElectrobunConfig } from "electrobun";

// SPEC §4.1 — config is mandatory in v1: it declares the entrypoints, the view
// assets and the copy map. Without it the build has nothing to bundle.
export default {
  app: {
    name: "Notes",
    identifier: "com.example.notes",
    version: "0.1.0",
  },
  runtime: { exitOnLastWindowClosed: true },
  build: {
    // Main process entrypoint (Bun runtime). Declared explicitly so relocating it stays legal.
    bun: { entrypoint: "src/bun/index.ts" },
    // Vite owns the renderer build; electrobun only copies its output into views/.
    // Do NOT also declare build.views — that would bundle the same source twice (SPEC §4.1).
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    // Keep Vite's output out of electrobun's watcher.
    watchIgnore: ["dist/**"],
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
