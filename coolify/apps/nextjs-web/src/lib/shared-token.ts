/**
 * shared-token.ts — 機械間認証の共有シークレット照合。
 *
 * 外部システムがヘッダで送ってくる固定トークンを、**長さで漏らさずに**
 * 突き合わせるためだけの関数。`timingSafeEqual` は長さの違うバッファを渡すと
 * 例外を投げるので、先に長さを比べてから呼ぶ（そこを省くと、トークン長の
 * 推測が例外の有無で出来てしまう）。
 *
 * 利用者:
 *  - GET  /api/preview/resolve  … X-Preview-Token / PREVIEW_SHARED_SECRET
 *  - POST /api/intake/inbound   … X-Intake-Token  / INTAKE_INBOUND_TOKEN
 *
 * どちらも「env 未設定なら 503 で機能ごと無効・不一致なら 401」で揃える
 * （mailrelay の mail-api も X-Mail-Token で同じ姿勢）。開けっ放しにしない。
 */

import { timingSafeEqual } from "node:crypto";

/**
 * 与えられたトークンが期待値と一致するか。
 *
 * `given` が null / 空、`expected` が空のときは常に false —
 * 「env を空文字にしたら誰でも通る」という抜け道を作らない。
 */
export function tokenMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // 長さが違えば timingSafeEqual は throw する。先に弾く。
  return a.length === b.length && timingSafeEqual(a, b);
}
