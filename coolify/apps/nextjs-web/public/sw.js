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
      // リンク未指定の通知はアプリ内通知センターを開く
      data: { link: data.link || "/notifications" },
      lang: "ja",
    }),
  );
});

// ブラウザが購読を差し替えたとき（鍵ローテーション等）に自動で再購読して
// サーバーへ保存し直す。失敗しても静かに諦める（次回の手動有効化で回復）。
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSub = event.oldSubscription;
  const key = oldSub?.options?.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";
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
