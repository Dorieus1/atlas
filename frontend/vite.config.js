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

      // Switched from generateSW (Workbox auto-generates the whole worker)
      // to injectManifest: push notifications need a `push` and
      // `notificationclick` listener, which generateSW's declarative
      // config has no way to express. injectManifest instead takes OUR
      // service worker source file (src/sw.js) and only injects the
      // precache manifest into it at build time - everything else about
      // the worker's behavior is hand-written there.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",

      injectManifest: {
        // Same file types the old generateSW globPatterns precached -
        // the built app shell (hashed JS/CSS, index.html, icons).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
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
        // Opening to the marketing landing page defeats the point of
        // installing the app - /today is the mobile field view (today's
        // jobs, one tap to call/navigate/sign), the actual reason someone
        // installs Atlas on their phone. A logged-out user still gets
        // redirected to /login from there like any other protected route.
        start_url: "/today",
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