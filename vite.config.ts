import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The client lives in src/client and builds to dist/client, which the
// Express server serves. In dev, Vite proxies the server's routes.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/readme": "http://localhost:8080",
    },
  },
});
