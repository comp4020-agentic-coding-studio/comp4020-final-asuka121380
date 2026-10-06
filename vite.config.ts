import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// The client lives in src/client and builds to dist/client, which the
// Express server serves. Two pages (ADR 0004): the homepage at / and the
// editor at /build/; only the editor loads three.js and the scene. In dev,
// Vite proxies the server's routes.
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
        build: resolve(import.meta.dirname, "src/client/build/index.html"),
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
