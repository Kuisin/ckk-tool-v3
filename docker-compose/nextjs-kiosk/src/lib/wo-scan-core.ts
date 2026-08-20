/**
 * wo-scan-core.ts — 指示書スキャンの純ロジック（isomorphic）。
 *
 * 指示書 QR は統一フォーマット `CKK:WO:<指示書番号>`（qr-payload.ts —
 * 指示書の帳票・検査表 PDF に印字済み）。ここでは読み取り文字列から
 * 指示書番号（通し連番の正の整数）だけを取り出す。
 *
 * プレフィクス無しの素の数字は受け付けない — カード QR（素の 16 桁）との
 * 誤読を防ぐため、指示書は必ず統一フォーマットで判定する。手入力の
 * フォールバックは画面側の番号入力欄が担う。
 */

import { QR_KINDS, qrKeyOfKind } from "./qr-payload";

/** PostgreSQL int4 の上限（work_order_number は Int）。 */
const MAX_WORK_ORDER_NUMBER = 2_147_483_647;

/**
 * スキャン文字列 → 指示書番号。指示書 QR でない・番号として不正なら null。
 */
export function parseWorkOrderQr(raw: string): number | null {
  const key = qrKeyOfKind(raw, QR_KINDS.WO);
  if (key == null) return null;
  return parseWorkOrderNumber(key);
}

/**
 * 手入力などの番号文字列 → 指示書番号（正の整数のみ）。不正は null。
 */
export function parseWorkOrderNumber(value: string): number | null {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_WORK_ORDER_NUMBER) {
    return null;
  }
  return n;
}
