import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

// injectManifest fills this array in at build time with every precached
// asset (hashed JS/CSS, index.html, icons) - the same set the old
// generateSW config precached via globPatterns.
precacheAndRoute(self.__WB_MANIFEST);

// Belt-and-suspenders, matching the old generateSW navigateFallbackDenylist:
// even the SPA's own navigation fallback must never intercept anything
// under /api/. CRM data (leads, appointments, customers) changes
// constantly and must never be served stale from a cache, so every /api/
// request always goes straight to the network, full stop.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkOnly()
);

// autoUpdate (registerType in vite.config.js) expects the new worker to
// take over immediately rather than waiting for every tab to close.
self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());


// ---- Web Push ----
//
// A push message's payload is whatever JSON webPushService.js sent
// (see backend/services/webPushService.js) - just {title, body, link}.
// This never trusts it blindly: JSON.parse is wrapped, and every field
// falls back to a safe default, since a malformed or unexpected payload
// here would otherwise throw inside the event handler and silently drop
// the notification entirely.
self.addEventListener("push", (event) => {

  let data = {};

  try {

    data = event.data ? event.data.json() : {};

  } catch (err) {

    data = {};

  }

  const title = data.title || "Atlas";

  const options = {
    body: data.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { link: data.link || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));

});


// Clicking the OS notification should focus an already-open Atlas tab
// and navigate it, rather than always opening a new one - most people
// already have Atlas open somewhere.
self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  const link = event.notification.data?.link || "/";

  event.waitUntil(

    (async () => {

      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of allClients) {

        if ("focus" in client) {

          await client.focus();

          if ("navigate" in client) {
            await client.navigate(link);
          }

          return;

        }

      }

      await self.clients.openWindow(link);

    })()

  );

});
