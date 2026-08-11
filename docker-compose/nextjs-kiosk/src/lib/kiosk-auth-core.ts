/**
 * kiosk-auth-core.ts — キオスク認証の純ロジック（定数・期限計算）。
 * DB / Cookie に触れない純関数のみ — vitest で単体テスト（kiosk-auth-core.test.ts）。
 */

export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 端末トークン 30日
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 人セッション 8h ハード
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // アイドル 5分で失効
export const IDLE_WARN_MS = 3 * 60 * 1000; // 残り 3分でカウントダウン表示
export const ACTIVITY_PING_MIN_INTERVAL_MS = 30 * 1000; // ping は最短 30s 間隔
export const PIN_REVERIFY_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3日未使用で PIN 再入力
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000; // 15分ロック
export const TICKET_TTL_MS = 2 * 60 * 1000; // PIN チケット 2分・単回使用
export const ONLINE_WINDOW_MS = 5 * 60 * 1000; // WS 未接続でも直近 5分の活動でオンライン扱い
export const WS_SWEEP_INTERVAL_MS = 30 * 1000; // オンライン判定の再計算間隔

export const REGISTRATION_CODE_LENGTH = 12;
export const CARD_ID_LENGTH = 16;

/** 人セッションの有効判定（ハード期限 + アイドル窓）。 */
export function isSessionAlive(
  now: Date,
  expiresAt: Date,
  lastActivityAt: Date,
  revokedAt: Date | null,
): boolean {
  if (revokedAt) return false;
  if (now.getTime() >= expiresAt.getTime()) return false;
  if (now.getTime() - lastActivityAt.getTime() >= IDLE_TIMEOUT_MS) return false;
  return true;
}

/** アイドル失効までの残り ms（負値なし）。 */
export function idleRemainingMs(now: Date, lastActivityAt: Date): number {
  return Math.max(
    0,
    IDLE_TIMEOUT_MS - (now.getTime() - lastActivityAt.getTime()),
  );
}

/** 3日ルール: 前回使用から 3日以上空いたら PIN 再入力（未使用 = 要 PIN）。 */
export function needsPinVerify(now: Date, lastUsedAt: Date | null): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - lastUsedAt.getTime() >= PIN_REVERIFY_AFTER_MS;
}

/** PIN ロック中か。 */
export function isPinLocked(now: Date, pinLockedUntil: Date | null): boolean {
  return pinLockedUntil !== null && now.getTime() < pinLockedUntil.getTime();
}

/** PIN 失敗の次状態: 試行回数と（上限到達なら）ロック解除時刻。 */
export function nextPinFailureState(
  now: Date,
  failedAttempts: number,
): { failedAttempts: number; lockedUntil: Date | null } {
  const attempts = failedAttempts + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    return {
      failedAttempts: 0, // ロック満了後は再カウント
      lockedUntil: new Date(now.getTime() + PIN_LOCK_MS),
    };
  }
  return { failedAttempts: attempts, lockedUntil: null };
}

/** デバイストークンの有効判定。 */
export function isDeviceTokenAlive(now: Date, expiresAt: Date | null): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** リンクコードの有効判定（発行と TTL は SY09 側 — 24h）。 */
export function isRegistrationAlive(
  now: Date,
  expiresAt: Date | null,
): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** PIN 形式: 4〜6 桁の数字。 */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4,6}$/.test(pin);
}
