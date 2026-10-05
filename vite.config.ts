import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser app. Built to dist/client and served by the Node server on the
// same origin as the API and WebSocket; there is no separate dev server in
// production.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
