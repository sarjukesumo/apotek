import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["sample-images/*.svg"],
      workbox: {
        navigateFallback: "/index.html",
      },
      manifest: {
        name: "D’Farma",
        short_name: "D’Farma",
        theme_color: "#1aa97a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        rewrite: (path) => `/batam-farma/asia-southeast2/api${path}`,
      },
    }
  }
});
