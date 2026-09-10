/**
 * api-write-core.ts — 書き込みの安全装置（純ロジック・試験対象）。
 *
 * 読み取りと違い、書き込みは**間違えると戻せない**。ここが守るのは 2 つだけ:
 *
 * 1. **再送を 1 回にする**（冪等キー）
 *    採番は月次リセットの連番なので、webhook の再送で `ORD-` が 2 本立つと
 *    後から見分けられない。在庫も請求も二重に動く。だから任意ではなく必須。
 *
 * 2. **古い前提の上書きを止める**（`If-Match`）
 *    機械は数分前に読んだ値で書きに来る。その間に人が画面で直していたら、
 *    last-write-wins は「人の修正を機械が黙って消す」になる。
 */

import { createHash } from "node:crypto";

/** 冪等キーとして受け付ける形。長すぎる・空・制御文字は拒む。 */
const KEY_SHAPE = /^[\x21-\x7E]{8,255}$/;

export function isValidIdempotencyKey(v: string | null | undefined): boolean {
  return typeof v === "string" && KEY_SHAPE.test(v);
}

/**
 * 要求の指紋。**メソッド・パス・本文の 3 つ**から作る。
 * パスを混ぜるのは、同じ鍵を別の口へ使い回した再送を弾くため。
 */
export function requestFingerprint(
  method: string,
  path: string,
  body: string,
): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()}\n${path}\n${body}`)
    .digest("hex");
}

export type IdempotencyDecision =
  /** 初めて見る鍵。実行してよい。 */
  | { kind: "proceed" }
  /** 同じ鍵・同じ要求。**保存した応答をそのまま返す**（再実行しない）。 */
  | { kind: "replay"; status: number; body: string }
  /**
   * 同じ鍵で違う要求。**422 で拒む。**
   * 黙って古い応答を返すと、呼び出し側の鍵の使い回しという不具合が
   * 見えなくなる（そして次に本当に必要な書き込みが失われる）。
   */
  | { kind: "conflict" };

export interface StoredIdempotency {
  requestHash: string;
  responseStatus: number;
  responseBody: string;
}

export function decideIdempotency(
  stored: StoredIdempotency | null,
  fingerprint: string,
): IdempotencyDecision {
  if (!stored) return { kind: "proceed" };
  if (stored.requestHash !== fingerprint) return { kind: "conflict" };
  return {
    kind: "replay",
    status: stored.responseStatus,
    body: stored.responseBody,
  };
}

/**
 * 行の版（ETag）。`updated_at` をそのまま使う — 版番号の列を足さずに済み、
 * 差分同期の順序キーと同じ値なので「読んだ版」と「同期した版」がずれない。
 *
 * 弱い ETag（`W/`）にするのは、本文がバイト単位で同一であることまでは
 * 保証しないため（多言語 JSON の鍵順など）。
 */
export function etagOf(updatedAt: Date): string {
  return `W/"${updatedAt.toISOString()}"`;
}

/** `If-Match` の値（`*` か ETag の並び）を解釈する。 */
export function parseIfMatch(header: string | null | undefined): {
  any: boolean;
  tags: string[];
} {
  if (!header) return { any: false, tags: [] };
  const trimmed = header.trim();
  if (trimmed === "*") return { any: true, tags: [] };
  return {
    any: false,
    tags: trimmed
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export type ConcurrencyDecision =
  /** `If-Match` が無い。**書き込みを拒む**（下参照）。 */
  | { kind: "required" }
  /** 版が一致した。書いてよい。 */
  | { kind: "ok" }
  /** 版が違う。409 で拒む。 */
  | { kind: "stale" };

/**
 * `If-Match` の判定。
 *
 * **ヘッダが無いときに素通ししない。** 「付ければ安全、付けなければ
 * last-write-wins」では、いちばん雑な呼び出し側がいちばん危険な経路を通る。
 * 意図的に上書きしたいなら `If-Match: *` と明示させる — 明示は記録に残る。
 */
export function decideConcurrency(
  header: string | null | undefined,
  current: Date,
): ConcurrencyDecision {
  const { any, tags } = parseIfMatch(header);
  if (any) return { kind: "ok" };
  if (tags.length === 0) return { kind: "required" };
  return tags.includes(etagOf(current)) ? { kind: "ok" } : { kind: "stale" };
}
