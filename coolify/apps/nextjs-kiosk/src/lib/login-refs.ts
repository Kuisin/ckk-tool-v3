/**
 * login-refs.ts — 認証イベントに残す**相関キー**の作り方。
 *
 * kiosk_cards.id は QR に刷ってある secret そのもの。実在しないカードを読んだ
 * 失敗行に生値を書くと、偽造カードの中身と正規カードの secret が同じ列に溜まる。
 * そこで「値そのもの」ではなく HMAC を残す — 同じカードで何回失敗したかは
 * 数えられるが、行を見ても元の値は復元できない。
 *
 * pepper（LOGIN_ATTEMPT_PEPPER）は **web と kiosk で同じ値**にすること。
 * 違うと card_ref / identifier_ref がアプリ間で相関しない。未設定でも落とさず、
 * 相関キーを付けないだけにする（attestSecret() の NOT_CONFIGURED と同じ姿勢）。
 */

import "server-only";
import { createHash, createHmac } from "node:crypto";

function pepper(): string | null {
  return process.env.LOGIN_ATTEMPT_PEPPER || null;
}

/** 相関キー（64 桁 hex）。pepper 未設定なら null。 */
export function correlationRef(
  value: string | null | undefined,
): string | null {
  const secret = pepper();
  if (!secret) return null;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}

/** 端末シグネチャ用のハッシュ（pepper 不要 — 相関キーではなく素の digest）。 */
export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
