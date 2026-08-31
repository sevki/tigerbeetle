import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // Same-origin in production (the built SPA is served by the wasm-worker Worker itself,
    // alongside its /ledger/* API — see wrangler.toml's [assets] and README.md). This proxy
    // reproduces that during `vite dev` against a locally running celld/wrangler dev instance,
    // so relative fetch("/ledger/...") calls work identically in both.
    proxy: {
      "/ledger": {
        target: process.env.VITE_LEDGER_PROXY_TARGET ?? "http://localhost:9876",
        changeOrigin: true,
      },
    },
  },
});
