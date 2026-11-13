import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "STEMCHARADES",
        short_name: "STEMCHARADES",
        description: "Explain STEM ideas without saying the forbidden words.",
        theme_color: "#4f46e5",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Never let the SPA fallback swallow API or socket requests.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/healthz/],
        runtimeCaching: [
          {
            // Decks: use the network when it answers fast, else the cached copy (offline Party mode).
            urlPattern: ({ url }) => url.pathname.startsWith("/api/decks"),
            handler: "NetworkFirst",
            options: {
              cacheName: "decks",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/healthz": "http://localhost:3000",
      "/api": "http://localhost:3000",
    },
  },
});
