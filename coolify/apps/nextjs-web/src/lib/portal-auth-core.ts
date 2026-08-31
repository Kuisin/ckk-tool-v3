/**
 * portal-auth-core.ts — 取引先ポータル認証の純ロジック（定数・期限計算）。
 * DB / Cookie に触れない純関数のみ — vitest で単体テスト。
 *
 * キオスク（kiosk-auth-core.ts）と同じ作りだが、値は用途に合わせて変えてある:
 * 共有端末は 5 分で切れてよいが、月に一度請求書を見に来る取引先を毎回
 * 締め出すと OTP メールを送る回数がそのまま増える。
 */

export const PORTAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // ハード期限 7日
export const PORTAL_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // アイドル 2時間
/**
 * VERIFY リンクを通ったあとのセッション。書類 1 件だけのスコープなので短い。
 * 通常ログインと同じ 7 日にしないのは、リンクは「その 1 件を今見せる」ための
 * ものだから（見終わったら閉じてよい）。
 */
export const PORTAL_LINK_SESSION_TTL_MS = 60 * 60 * 1000; // 1時間

/** OTP の有効時間。キオスクのリンクコードと同じ 10 分。 */
export const PORTAL_OTP_TTL_MS = 10 * 60 * 1000;
/** OTP の桁数（Crockford の 32 文字 = 40bit）。 */
export const PORTAL_OTP_LENGTH = 8;
/**
 * 1 つのチャレンジで試せる回数。上限に達したら**そのチャレンジだけ**焼く。
 * アカウントはロックしない — 第三者がチャレンジを焼くだけで顧客を締め出せてしまう。
 */
export const PORTAL_OTP_MAX_ATTEMPTS = 5;

/** バックアップコードの発行枚数と桁数（50bit）。 */
export const PORTAL_BACKUP_CODE_COUNT = 10;
export const PORTAL_BACKUP_CODE_LENGTH = 10;

/** 書類リンクの既定 / 上限の有効期間。**無期限は作れない**。 */
export const PORTAL_LINK_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
export const PORTAL_LINK_MAX_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180日

/**
 * セッションの有効判定（ハード期限 + アイドル窓 + 失効）。
 *
 * **判定は常にここで時刻式で行う** — cron は行を消して表を短く保つだけで、
 * 「まだ使えるか」には一切関与しない（portal-cron.sql の頭のコメント参照）。
 */
export function isPortalSessionAlive(
  now: Date,
  expiresAt: Date,
  lastActivityAt: Date,
  revokedAt: Date | null,
): boolean {
  if (revokedAt) return false;
  if (now.getTime() >= expiresAt.getTime()) return false;
  if (now.getTime() - lastActivityAt.getTime() >= PORTAL_IDLE_TIMEOUT_MS)
    return false;
  return true;
}

/** アイドル失効までの残り ms（負値なし）。 */
export function portalIdleRemainingMs(now: Date, lastActivityAt: Date): number {
  return Math.max(
    0,
    PORTAL_IDLE_TIMEOUT_MS - (now.getTime() - lastActivityAt.getTime()),
  );
}

/** OTP チャレンジが今も使えるか（期限 + 使用済み + 試行上限）。 */
export function isPortalChallengeUsable(
  now: Date,
  challenge: {
    expiresAt: Date;
    consumedAt: Date | null;
    attempts: number;
  },
): boolean {
  if (challenge.consumedAt) return false;
  if (now.getTime() >= challenge.expiresAt.getTime()) return false;
  if (challenge.attempts >= PORTAL_OTP_MAX_ATTEMPTS) return false;
  return true;
}

export type PortalLinkDenyReason = "REVOKED" | "EXPIRED" | "EXHAUSTED" | null;

/**
 * 書類リンクが今も使えるか。使えない理由まで返すのは、`login_attempts` に
 * 区別して残すため（画面の文言は区別しない — 存在を漏らさないので）。
 */
export function portalLinkDenyReason(
  now: Date,
  link: {
    expiresAt: Date;
    revokedAt: Date | null;
    maxUses: number | null;
    useCount: number;
  },
): PortalLinkDenyReason {
  if (link.revokedAt) return "REVOKED";
  if (now.getTime() >= link.expiresAt.getTime()) return "EXPIRED";
  if (link.maxUses !== null && link.useCount >= link.maxUses)
    return "EXHAUSTED";
  return null;
}

/**
 * 発行しようとしている有効期限が許される範囲か。
 * 上限を超えるものと、過去の日付を弾く（無期限は型で表現できないので必須引数）。
 */
export function isPortalLinkExpiryAllowed(now: Date, expiresAt: Date): boolean {
  const ms = expiresAt.getTime() - now.getTime();
  return ms > 0 && ms <= PORTAL_LINK_MAX_TTL_MS;
}
