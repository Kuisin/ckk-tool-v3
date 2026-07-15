/**
 * sw.js — PWA Service Worker（Web Push 受信・通知クリック）。
 *
 * 配信ペイロード（lib/push.ts）: { title, body, link }
 * オフラインキャッシュは行わない（業務データの鮮度優先 — 通知専用 SW）。
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "通知" };
  }
  const title = data.title || "CKK 業務管理システム";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link: data.link || "/" },
      lang: "ja",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // 既に開いているタブがあればフォーカスして遷移、無ければ新規に開く
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(link);
            return;
          }
        }
        return self.clients.openWindow(link);
      }),
  );
});
