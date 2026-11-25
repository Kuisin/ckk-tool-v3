/**
 * marking-number.ts — 印字番号（製品にレーザーで刻む通し番号）の整形。純関数。
 *
 * 形式は `A{base}-{NNN}`:
 *   - base  … 注文明細 1 行に 1 つ払い出す通し番号（order_lines.marking_base。
 *             200000 始まり・月次リセットなし。採番は DB — 明細の確定時に
 *             トリガーが SEQUENCE app.marking_number_seq から振る）
 *   - NNN   … その明細の何本目か（001..数量）。桁は最低 3、数量が 999 を
 *             超えるときは数量の桁数まで広げる（同じ明細の番号の桁を揃える）
 *
 * 明細ごとに 1 つだけ刻むときは枝番を落として `A{base}`。1 本ずつか明細ごとかは
 * 注文明細に持たない — どちらも base から導けるので、現場が刻むときに選ぶ。
 *
 * ⚠️ **nextjs-kiosk との twin file**（`pnpm twin:sync` / twin-files.test.ts）。
 * 共有端末の工程画面にも同じ番号を出すので、整形を 2 か所に書かない。
 */

export const MARKING_PREFIX = "A";

/** 枝番の最小桁数。 */
const MIN_PIECE_DIGITS = 3;

/** 枝番の桁数 — 最低 3、数量がそれより長ければ数量の桁数。 */
export function markingPieceDigits(quantity?: number | null): number {
  const q =
    quantity != null && Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  return Math.max(MIN_PIECE_DIGITS, String(Math.max(q, 0)).length);
}

/**
 * 印字番号を 1 つ整形する。
 *   formatMarking(200000)          → "A200000"（明細ごと）
 *   formatMarking(200000, 1)       → "A200000-001"（1 本ずつ）
 *   formatMarking(200000, 7, 1200) → "A200000-0007"（数量に合わせて桁を広げる）
 */
export function formatMarking(
  base: number,
  piece?: number | null,
  quantity?: number | null,
): string {
  const head = `${MARKING_PREFIX}${base}`;
  if (piece == null) return head;
  const digits = markingPieceDigits(quantity ?? piece);
  return `${head}-${String(piece).padStart(digits, "0")}`;
}

/**
 * 1 本ずつ刻むときの最初と最後の番号、および明細ごとの番号。
 * 数量が 1 未満（あり得ないが、壊れたデータで画面を落とさない）は 1 本として扱う。
 */
export function markingRange(
  base: number,
  quantity: number,
): { first: string; last: string; perLine: string } {
  const qty = Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
  return {
    first: formatMarking(base, 1, qty),
    last: formatMarking(base, qty, qty),
    perLine: formatMarking(base),
  };
}
