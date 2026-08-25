import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig({

  plugins: [

    react(),

    tailwindcss(),

    VitePWA({
      // autoUpdate: the service worker checks for a new build on every page
      // load and swaps in fresh precached assets in the background, then
      // takes over on the next navigation - no stale "please refresh" purgatory,
      // and no interstitial prompt component we'd have to build and maintain.
      // Since this app has no offline-critical workflows, silently staying
      // current is the safer default over prompting the user to update.
      registerType: "autoUpdate",

      // Only the built app shell (hashed JS/CSS, index.html, icons) is
      // precached via Workbox's generateSW - the default strategy. No
      // runtimeCaching entries are added, so this service worker never
      // intercepts or caches anything under /api/: those requests always
      // go straight to the network. That's deliberate - CRM data (leads,
      // appointments, customers) changes constantly and must never be served
      // stale from a cache.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Belt-and-suspenders: even the SPA navigation fallback (used for
        // client-side routing when offline/on a fresh load) must never
        // swallow an /api/ request.
        navigateFallbackDenylist: [/^\/api\//],
      },

      includeAssets: ["favicon.svg", "icons.svg"],

      manifest: {
        name: "Atlas",
        short_name: "Atlas",
        description:
          "Atlas is an AI receptionist and CRM built for small businesses - customers, leads, and follow-ups, handled automatically.",
        // Matches the dark UI: body background is --color-ink-950, and the
        // browser/OS chrome (status bar, splash screen) uses the brand-600
        // orange, both from frontend/src/index.css.
        background_color: "#08090d",
        theme_color: "#ea580c",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),

  ],

  server: {

    host: true,

  },

});