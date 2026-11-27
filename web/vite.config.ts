/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "PoshanVaani",
        short_name: "PoshanVaani",
        description: "Hands-free voice register for anganwadi growth monitoring",
        theme_color: "#16264a",
        background_color: "#eef3f1",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,woff}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    environment: "node",
  },
});
