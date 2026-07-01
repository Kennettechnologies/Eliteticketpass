// EliteTicketPass Service Worker — Push Notifications
const CACHE_NAME = "eliteticketpass-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// ── Push handler ──────────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  let data = { title: "EliteTicketPass", body: "You have a new notification", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch {}

  const options = {
    body:    data.body,
    icon:    "/icon-192.png",
    badge:   "/icon-192.png",
    vibrate: [100, 50, 100],
    data:    { url: data.url || "/" },
    actions: [
      { action: "view",    title: "View"    },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});

// ── Background sync (offline scan queue) ─────────────────────────────────────
self.addEventListener("sync", event => {
  if (event.tag === "sync-scans") {
    event.waitUntil(syncOfflineScans());
  }
});

async function syncOfflineScans() {
  // Handled by the gate app page — SW just triggers the event
}
