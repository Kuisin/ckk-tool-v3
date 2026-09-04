/**
 * jst-day-range.ts — 「YYYY-MM-DD」の日付 2 つを JST の 1 日の端に固定して
 * Date に変換する。純ロジック（I/O なし）。
 *
 * `new Date("2026-09-05T00:00:00")`（オフセット無し）は**サーバーのローカル TZ**
 * で解釈される。Docker のコンテナは UTC なので、承認代理の「9/5〜9/5」が
 * 9/5 09:00 JST 〜 9/6 08:59 JST になり、9/5 の朝は代理が効いていなかった。
 * 業務の日付は JST で決まる（締日・採番と同じ）ので、ここで `+09:00` を明示する。
 */

export const JST_OFFSET = "+09:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(v: string): void {
  if (!DATE_RE.test(v)) {
    // 呼び出し側のバグ（zod を通った日付しか来ない）— 利用者向け文言ではない
    throw new RangeError(`not a YYYY-MM-DD date: ${v}`);
  }
}

/** その日の始まり（JST 00:00:00.000）。 */
export function jstStartOfDay(date: string): Date {
  assertDate(date);
  return new Date(`${date}T00:00:00.000${JST_OFFSET}`);
}

/** その日の終わり（JST 23:59:59.999）。 */
export function jstEndOfDay(date: string): Date {
  assertDate(date);
  return new Date(`${date}T23:59:59.999${JST_OFFSET}`);
}

/** 開始日の始まりから終了日の終わりまで（両端とも JST）。 */
export function jstDayRange(
  from: string,
  until: string,
): { start: Date; end: Date } {
  return { start: jstStartOfDay(from), end: jstEndOfDay(until) };
}
