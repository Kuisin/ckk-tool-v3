/**
 * notifications-core.ts — 通知まわりの純粋関数（DB・認証に触れない）。
 *
 * lib/notifications.ts は Prisma と Auth.js を掴むので単体テストから import
 * できない。遷移先の検証（オープンリダイレクトを弾く）と、端末通知の
 * リンク先の組み立ては壊れると被害が大きいので、ここに分けて試験できる形に
 * してある。既存の呼び出し口を変えないよう、notifications.ts が再輸出する。
 */

/**
 * アプリ内パスの検証（監査 P1-6: `/\\evil.com` や二重エンコードの
 * オープンリダイレクトを遮断）。正規化して pathname+search が元と一致する
 * 相対パスのみ許可。不正は undefined を返す。
 */
export function sanitizeLinkPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith("/") || path.includes("\\")) return undefined;
  try {
    const u = new URL(path, "http://x");
    if (u.origin !== "http://x") return undefined;
    const normalized = u.pathname + u.search;
    // バックスラッシュ・プロトコル相対（//）を弾く
    if (u.pathname.startsWith("//")) return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

/** 通知 id（uuid）の形か。中継 URL は素の文字列を受けるので入口で弾く。 */
export function isNotificationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * 端末通知（Web Push）のリンク先。対象ページを**直接**開かせず、必ずこの
 * 中継 URL を渡す — 端末の通知をタップして用が済んだのに、アプリ内のベルは
 * 未読のまま残る（既読にできるのは画面の中だけだった）という食い違いを消す。
 * 中継先（/notifications/[id]/open）が既読にしてから対象ページへ送る。
 */
export function notificationOpenPath(id: string): string {
  return `/notifications/${encodeURIComponent(id)}/open`;
}
