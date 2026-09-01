/**
 * kiosk-auth-core.ts — キオスク認証の純ロジック（定数・期限計算）。
 * DB / Cookie に触れない純関数のみ — vitest で単体テスト（kiosk-auth-core.test.ts）。
 */

import { normalizeCode } from "./crockford";
import { parseQrPayload, QR_KINDS } from "./qr-payload";

export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 端末トークン 30日
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 人セッション 8h ハード
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // アイドル 5分で失効
export const IDLE_WARN_MS = 3 * 60 * 1000; // 残り 3分でカウントダウン表示
export const ACTIVITY_PING_MIN_INTERVAL_MS = 30 * 1000; // ping は最短 30s 間隔
export const PIN_REVERIFY_DEVICE_IDLE_MS = 48 * 60 * 60 * 1000; // その端末で 48h 未使用なら PIN 再入力
export const PIN_REVERIFY_MAX_MS = 14 * 24 * 60 * 60 * 1000; // 活動に関係なく 2 週間ごとに PIN 再入力
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000; // 15分ロック
export const TICKET_TTL_MS = 2 * 60 * 1000; // PIN チケット 2分・単回使用
export const ONLINE_WINDOW_MS = 5 * 60 * 1000; // WS 未接続でも直近 5分の活動でオンライン扱い
export const WS_SWEEP_INTERVAL_MS = 30 * 1000; // オンライン判定の再計算間隔

export const REGISTRATION_CODE_LENGTH = 12; // リンクコード（タブレット発行）
export const LINK_REQUEST_TTL_MS = 10 * 60 * 1000; // リンクコード 10分
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

/**
 * スキャンのみログインの可否（true = 要 PIN）。両方満たすときだけ PIN を省略:
 *   1. **この端末で** 48 時間以内に使用実績がある（lastUsedOnDeviceAt =
 *      同カード×同端末の最新セッションの活動時刻。初めて使う端末は常に PIN）
 *   2. 最後の PIN 検証（pin_last_verified_at）から 2 週間以内
 *      （活動が続いていても 2 週間ごとに必ず PIN を求める）
 */
export function needsPinVerify(
  now: Date,
  lastUsedOnDeviceAt: Date | null,
  pinLastVerifiedAt: Date | null,
): boolean {
  if (
    !lastUsedOnDeviceAt ||
    now.getTime() - lastUsedOnDeviceAt.getTime() >= PIN_REVERIFY_DEVICE_IDLE_MS
  ) {
    return true;
  }
  if (
    !pinLastVerifiedAt ||
    now.getTime() - pinLastVerifiedAt.getTime() >= PIN_REVERIFY_MAX_MS
  ) {
    return true;
  }
  return false;
}

/**
 * カード有効期間の判定（テンポラリカード用。null = 無期限）。
 * 期間外はログイン不可 — 判定はログイン時のみ（既存セッションは
 * 8h ハード期限 / 5分アイドルで自然失効）。
 */
export function isCardWithinValidPeriod(
  now: Date,
  validFrom: Date | null,
  validUntil: Date | null,
): boolean {
  if (validFrom && now.getTime() < validFrom.getTime()) return false;
  if (validUntil && now.getTime() > validUntil.getTime()) return false;
  return true;
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

/**
 * 読み取った QR ペイロードからカード ID を取り出す。受け付ける形は 3 つ:
 *
 * 1. **統一形式** `CKK:CARD:ABCD-EFGH-JKLM-NPQR`（lib/qr-payload.ts）= 現行の印刷。
 *    CARD 以外の種別（指示書ストリップ `CKK:WO:…` など）は空文字を返す —
 *    ログイン画面に別の QR をかざしても人として認証されない。
 * 2. 素のカード ID（プレフィクス無し）— **既に配ってあるカード**の後方互換。
 * 3. URL 形式（`?secret=` / 末尾セグメント）— 旧実装の名残。
 */
export function extractCardId(payload: string): string {
  const trimmed = String(payload ?? "").trim();

  const unified = parseQrPayload(trimmed);
  if (unified) {
    return unified.kind === QR_KINDS.CARD ? normalizeCode(unified.key) : "";
  }

  try {
    const url = new URL(trimmed);
    const secret =
      url.searchParams.get("secret") ?? url.pathname.split("/").pop() ?? "";
    return normalizeCode(secret);
  } catch {
    return normalizeCode(trimmed);
  }
}

/**
 * その状態の端末に**新しいリンクコードを出してよいか**。
 *
 * 出してはいけないのは「Cookie はあるが、その端末は止められている」場合
 * （DISABLED / REVOKED）。ここで新しいコードを出すと:
 *
 *   1. **停止・失効が迂回できる。** 管理者が止めた端末が、自分で登録し直して
 *      別のプロファイルとして復活する。
 *   2. **同じ実機のプロファイルが二重にできる。** 元の行は残ったままなので、
 *      一覧に同じタブレットが 2 つ並び、どちらが本物か分からなくなる。
 *
 * NO_COOKIE / NOT_FOUND は素の新品・行ごと消された端末なので、登録してよい。
 * EXPIRED は行が生きている（ACTIVE）ので、まず再有効化を試す道がある。
 */
export function registrationBlocked(reason: string): boolean {
  return reason === "DISABLED" || reason === "REVOKED";
}
