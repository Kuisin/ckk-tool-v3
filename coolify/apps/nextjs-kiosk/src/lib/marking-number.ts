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
 * **分割**（1 明細を複数の指示書に分けて作る）: 指示書の割当
 * （work_order_order_lines）が作成時に明細の一部だけだったとき、その割当は
 * 分割番号（marking_split = 1, 2, …）を持ち、接頭辞は基数の後ろに分割番号を
 * 足した `A{base}{split}`。枝番は分割の中で 001 から割当数量まで:
 *   A2000001-001 〜 A2000001-055 / A2000002-001 〜 A2000002-010
 * 分割番号 0（明細全部を 1 つの指示書で作る）は従来どおり `A{base}` で、範囲は
 * 明細の受注数量ぶん。分割番号は割当の作成時に DB が 1 度だけ決めて凍結する
 * （migration 20261127120000_marking_split）。
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

/** 分割番号が付いているか（0 / null = 分割でない）。 */
export function isMarkingSplit(split?: number | null): split is number {
  return split != null && Number.isFinite(split) && Math.trunc(split) > 0;
}

/**
 * 接頭辞（枝番の前まで）。
 *   markingHead(200000)    → "A200000"
 *   markingHead(200000, 2) → "A2000002"（分割 2）
 */
export function markingHead(base: number, split?: number | null): string {
  const tail = isMarkingSplit(split) ? String(Math.trunc(split)) : "";
  return `${MARKING_PREFIX}${base}${tail}`;
}

/**
 * 印字番号を 1 つ整形する。
 *   formatMarking(200000)           → "A200000"（明細ごと）
 *   formatMarking(200000, 1)        → "A200000-001"（1 本ずつ）
 *   formatMarking(200000, 7, 1200)  → "A200000-0007"（数量に合わせて桁を広げる）
 *   formatMarking(200000, 5, 55, 1) → "A2000001-005"（分割 1 の 5 本目）
 */
export function formatMarking(
  base: number,
  piece?: number | null,
  quantity?: number | null,
  split?: number | null,
): string {
  const head = markingHead(base, split);
  if (piece == null) return head;
  const digits = markingPieceDigits(quantity ?? piece);
  return `${head}-${String(piece).padStart(digits, "0")}`;
}

/**
 * 1 本ずつ刻むときの最初と最後の番号、および明細ごと（分割なら分割ごと）の番号。
 * 数量が 1 未満（あり得ないが、壊れたデータで画面を落とさない）は 1 本として扱う。
 */
export function markingRange(
  base: number,
  quantity: number,
  split?: number | null,
): { first: string; last: string; perLine: string } {
  const qty = Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
  return {
    first: formatMarking(base, 1, qty, split),
    last: formatMarking(base, qty, qty, split),
    perLine: formatMarking(base, null, null, split),
  };
}

/**
 * 指示書の割当 1 件ぶんの印字番号。分割（split > 0）なら分割の接頭辞で割当数量
 * ぶん、そうでなければ明細の基数で受注数量ぶん。
 *
 * 分割番号 0 の割当があとで一部に直されても範囲は明細ぶんのまま — 番号は作成時に
 * 凍結していて、刷った番号を後から動かさない（DB のトリガーが変更を拒否する）。
 */
export function allocationMarkingRange(a: {
  base: number;
  split?: number | null;
  lineQuantity: number;
  allocatedQuantity: number;
}): { first: string; last: string; perLine: string; split: number | null } {
  const split = isMarkingSplit(a.split) ? Math.trunc(a.split) : null;
  return {
    ...markingRange(
      a.base,
      split != null ? a.allocatedQuantity : a.lineQuantity,
      split,
    ),
    split,
  };
}
