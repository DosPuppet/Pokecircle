import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  build: {
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // French catalogs, loaded at start-up: French is the default language.
            { name: "locales", test: /packages[\\/]\w+[\\/]locales[\\/]/ },
            // Card data is a file of its own: a code update does not force a new download of it.
            { name: "cards", test: /packages[\\/]cards[\\/]data[\\/]/ },
            { name: "qrscan", test: /node_modules[\\/]jsqr[\\/]/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      // Online play: the /ws WebSocket goes to the game server (npm run server).
      "/ws": { target: "ws://localhost:8788", ws: true },
      // Relay of TCGdex images (done by the server in production, see server/src/index.ts).
      "/tcgdex": {
        target: "https://assets.tcgdex.net",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tcgdex/, ""),
      },
    },
  },
});
