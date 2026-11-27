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
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "fonts/*.woff2"],
      // Installable on phones: opens full screen from the home screen, in portrait, offline for Party mode.
      manifest: {
        id: "/",
        name: "STEMCHARADES",
        short_name: "STEMCHARADES",
        description: "A party game for STEM revision: explain it without saying the forbidden words.",
        lang: "en",
        theme_color: "#1e3a2f",
        background_color: "#1e3a2f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["education", "games"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Party mode", short_name: "Party", url: "/#/party", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Online room", short_name: "Online", url: "/#/online", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        // The chalkboard fonts are part of the app: cache them so Party mode looks right offline too.
        globPatterns: ["**/*.{js,css,html,woff2,svg,png}"],
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
