import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// The client lives in src/client and builds to dist/client, which the
// Express server serves. Three pages: the homepage's building table at /
// (ADR 0014), the room lobby at /build/ (ADR 0007: create, join, friends,
// invites), and the editor at /build/room/:id. The editor loads three.js and
// the game's scene; the homepage loads three.js lazily, only once WebGL is
// known to work, and never the game's scene. In dev, Vite proxies the
// server's routes.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "src/client/index.html"),
        lobby: resolve(import.meta.dirname, "src/client/build/index.html"),
        editor: resolve(import.meta.dirname, "src/client/build/room/index.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/readme": "http://localhost:8080",
    },
  },
});
