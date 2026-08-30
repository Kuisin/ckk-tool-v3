/**
 * notifications-core.ts — 通知まわりの純粋関数（DB・認証に触れない）。
 *
 * lib/notifications.ts は Prisma と Auth.js を掴むので単体テストから import
 * できない。遷移先の検証（オープンリダイレクトを弾く）と、端末通知の
 * リンク先の組み立ては壊れると被害が大きいので、ここに分けて試験できる形に
 * してある。既存の呼び出し口を変えないよう、notifications.ts が再輸出する。
 */

/**
 * 通知の種別。**メール設定（どの種別を待たせずに送るか）が値を列挙する**ので、
 * 型だけでなく実体の配列としてここに置く。notifications.ts は server-only の
 * 依存を抱えていて設定画面から import できない。
 */
export const NOTIFICATION_TYPES = [
  "APPROVAL_REQUEST", // 承認依頼 → 承認者へ
  "APPROVAL_RESULT", // 承認/差し戻し → 依頼者へ
  "INTAKE", // 注文請書 自動取込の結果
  "PURCHASE", // 素材発注の状態遷移
  "SHARE", // ページ共有（layout/share-actions）
  "DESIGN", // 設計依頼の担当指定・状態遷移
  "FORM_COMPLETED", // 申請・報告の完了 → 共有先（完了通知を付けた相手）へ
  "SYSTEM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

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

/**
 * 通知 1 件ぶんの外部チャネル（メール / 端末通知）のリンク先。
 *
 * 2 つのチャネルで**違うのは 1 点だけ** — 対象ページが無い通知の扱い:
 *   - メール … リンクを出さない（本文で完結している。押す先が通知一覧しか
 *     無いのにボタンを置いても手間が増えるだけ）
 *   - 端末通知 … 必ず開き先が要る（タップできない通知は作れない）ので通知一覧へ
 *
 * それ以外は同じで、どちらも中継 URL（notificationOpenPath）を指す。対象ページを
 * 直接指していた頃は、メールや端末から用を済ませてもアプリ内のベルが未読のまま
 * 残っていた。id が無いとき（作成行を引けなかったとき）だけ従来の直リンクに落ちる。
 */
export function externalNotificationLinks(input: {
  notificationId?: string;
  linkPath?: string | null;
}): { mail: string | null; push: string } {
  const relay = input.notificationId
    ? notificationOpenPath(input.notificationId)
    : undefined;
  return {
    mail: input.linkPath ? (relay ?? input.linkPath) : null,
    push: relay ?? input.linkPath ?? "/notifications",
  };
}
