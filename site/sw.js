// NewsESF servis çalışanı: site kapalıyken gelen push bildirimlerini gösterir.
// Sayfaları önbelleğe almaz; haberler her zaman sunucudan güncel okunur.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (olay) => olay.waitUntil(self.clients.claim()));

self.addEventListener("push", (olay) => {
  let yuk = {};
  try {
    yuk = olay.data ? olay.data.json() : {};
  } catch (e) {
    yuk = { baslik: "NewsESF", govde: olay.data ? olay.data.text() : "" };
  }
  const secenekler = {
    body: yuk.govde || "",
    icon: "simge-192.png",
    badge: "simge-192.png",
    tag: yuk.etiket || undefined,
    data: { url: yuk.url || "./" },
  };
  if (yuk.gorsel) secenekler.image = yuk.gorsel;
  olay.waitUntil(self.registration.showNotification(yuk.baslik || "NewsESF", secenekler));
});

self.addEventListener("notificationclick", (olay) => {
  olay.notification.close();
  const url = new URL(olay.notification.data && olay.notification.data.url || "./", self.registration.scope).href;
  olay.waitUntil((async () => {
    // Bildirim siteyi açıyorsa ve site zaten açıksa o pencereye geç.
    if (url.startsWith(self.registration.scope)) {
      const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const acik = pencereler.find((p) => p.url.startsWith(self.registration.scope));
      if (acik) return acik.focus();
    }
    return self.clients.openWindow(url);
  })());
});
