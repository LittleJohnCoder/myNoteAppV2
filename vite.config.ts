import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPEC §4.2 — Vite owns the React build into dist/; electrobun copies dist/ into
// views/mainview/. Asset URLs in the built HTML ("/assets/…") resolve under the
// views://mainview/ host, so the default base is correct here.
export default defineConfig({
  plugins: [react()],
  root: "src/mainview",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/mainview", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: { port: 5173, strictPort: true },
});
