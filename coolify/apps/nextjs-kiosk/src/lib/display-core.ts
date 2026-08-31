/**
 * display-core.ts — 管理ディスプレイの純ロジック（定数・期限計算・コード解釈）。
 * DB / Cookie に触れない純関数のみ — vitest で単体テスト（display-core.test.ts）。
 *
 * キオスクの kiosk-auth-core.ts と同じ役どころだが、ディスプレイは
 * 「人が居ない機器」なのでセッション・PIN・アイドルの概念を持たない。
 */

import { normalizeCode } from "./crockford";

/**
 * ディスプレイトークンは **365 日**。キオスク端末の 30 日と違えているのは、
 * 壁のディスプレイは誰も触らないから — 短いと、誰も見ていない間に自分で
 * ペアリング画面へ戻ってしまい、現場は「テレビが壊れた」としか分からない。
 * 失効は管理画面から即座にできる（期限は保険であって主たる制御ではない）。
 */
export const DISPLAY_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** ペアリングコードの桁数と寿命（キオスクのリンクコードと同じ規約）。 */
export const PAIRING_CODE_LENGTH = 12;
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/**
 * オンライン判定の窓。キオスクの ONLINE_WINDOW_MS と同値だが、**同じ定数を
 * import せず別に置く** — あちらは「人がタブレットを触っていた形跡」の窓で、
 * こちらは「Pi が生きている」の窓。意味が違うものを 1 つの定数にすると、
 * 片方の都合で動かしたときにもう片方が黙って壊れる。
 */
export const DISPLAY_ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** WS の生存確認とハートビートの間隔。 */
export const DISPLAY_SWEEP_INTERVAL_MS = 30 * 1000;

/** ディスプレイ側から打つハートビートの最短間隔（WS が張れないときの保険）。 */
export const DISPLAY_HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;

/** デバイストークンの有効判定。 */
export function isDisplayTokenAlive(
  now: Date,
  expiresAt: Date | null,
): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** ペアリングコードの有効判定。 */
export function isPairingAlive(now: Date, expiresAt: Date | null): boolean {
  return expiresAt !== null && now.getTime() < expiresAt.getTime();
}

/** 死活判定 — last_seen_at が窓の内側か。null は「一度も見ていない」。 */
export function isDisplayOnline(now: Date, lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < DISPLAY_ONLINE_WINDOW_MS;
}

/** ペアリング期限までの残り ms（負値なし）。画面のカウントダウン用。 */
export function pairingRemainingMs(now: Date, expiresAt: Date): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * 管理側が読み取った値からペアリングコードを取り出す。受け付ける形は 2 つ:
 *
 * 1. **ペアリング URL**（`https://…/settings/displays/pair?code=ABCD-EFGH-JKLM`）
 *    — ディスプレイの画面に出る QR の中身。スマホの標準カメラで読んで
 *    そのまま開けることを優先した。
 * 2. 素のコード（`ABCD-EFGH-JKLM` / `ABCDEFGHJKLM`）— 画面に文字でも出している
 *    ので、QR が読めないときに手で打てる。
 *
 * **`CKK:` 統一形式（qr-payload.ts）はここでは使わない。** あちらは紙に刷る
 * 書類の規約で、URL を入れない決まりになっている。ここは紙に刷らないし、
 * 脚立の上の人がカメラを向けて 1 手で開けることのほうが価値が高い。
 * コードは 10 分で失効する単回のもので、それ自体はアクセス権を持たない
 * （ペアリングを完了できるのは認証済みの管理者だけ）。
 *
 * 一致しなければ空文字 — 呼び出し側は「読み取れません」を出す。
 */
export function extractPairingCode(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    candidate = url.searchParams.get("code") ?? "";
  } catch {
    // URL でなければ素のコードとして扱う
  }

  const normalized = normalizeCode(candidate);
  return normalized.length === PAIRING_CODE_LENGTH ? normalized : "";
}
