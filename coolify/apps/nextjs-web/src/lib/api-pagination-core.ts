/**
 * api-pagination-core.ts — keyset ページングと差分同期の純ロジック。
 *
 * ■ なぜ OFFSET を使わないのか
 *
 * 読んでいる最中に行が増えると `OFFSET` は**黙って行を飛ばす**。しかも
 * 呼び出し側からは飛んだことが観測できない（応答は正常に見える）。
 * 機械が定期的に引く口で最も避けたい壊れ方なので、口の設計として禁じる。
 *
 * ■ カーソルは必ず「時刻 + 同着の決着」の組
 *
 * 時刻だけだと、同じミリ秒に更新された行が境界で落ちる。一括更新をすると
 * 実際に何十行も同じ時刻になるので、これは理論上の話ではない。
 * 決着キーは**どの表でも行の `id`**（uuid / 連番 int）。
 * 書類（見積書・注文請書・出荷書・納品書・請求書）は番号設計 PR-B まで複合 PK
 * `(yearMonth, seq)` で決着していたが、いまは uuid の `id` を持つ。番号は
 * 「自社法人 × 会計年度」の連番で、法人をまたいで同じ値になり得るので
 * （番号設計 PR-C）、番号では決着が付かない。
 * 旧い `doc` 形のカーソル（`{kind:"doc", t, ym, seq}`）は**読めない**
 * （null → 呼び出し側が 400 invalid_cursor にする）— 連携先はカーソル無しで
 * 同期をやり直す。黙って先頭へ戻すと、どこまで読んだかが分からなくなる。
 *
 * ■ `?updatedSince=` は `>=`（at-least-once）
 *
 * 前回の `syncedAt` をそのまま渡してもらう前提で、境界は**含める**。
 * `>` にすると、`syncedAt` とまったく同じ時刻に書かれた行が永久に届かない。
 * 同じ行が 2 度届くほうが、1 度も届かないよりずっとよい —
 * **呼び出し側は冪等に処理すること**（_specs/api.md §5）。
 */

/** 1 ページの既定・上限。上限は「1 往復で全件」を防ぐためのもの。 */
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/** カーソル位置（順序キーの時刻 + 行の id）。 */
export interface IdCursor {
  kind: "id";
  /** 順序キーの値（ISO 8601）。 */
  t: string;
  /**
   * 決着キー。**型をそのまま保つ**（uuid は string、連番 PK は number）。
   * ここで `String(id)` に丸めると、int の主キーを持つ表で Prisma が
   * `Argument \`gt\`: Expected Int, provided String` で落ちる。
   * JSON は両方の型を往復できるので、丸める理由が無い。
   */
  id: string | number;
}

export type Cursor = IdCursor;

/** 不透明化する（中身は実装の都合で、契約ではない）。 */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/** 壊れたカーソルは null。呼び出し側が 400 にする（黙って先頭に戻さない）。 */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!o || typeof o !== "object") return null;
    if (o.kind === "id") {
      const idOk = typeof o.id === "string" || typeof o.id === "number";
      return typeof o.t === "string" && idOk
        ? { kind: "id", t: o.t, id: o.id }
        : null;
    }
    // 旧い `doc` 形（複合 PK で決着していた頃のカーソル）を含め、知らない形は
    // 無効として扱う。
    return null;
  } catch {
    return null;
  }
}

/** `?limit=` の解釈。範囲外は既定へ丸めず、**上限で頭打ち**にする。 */
export function parseLimit(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/** `?updatedSince=` の解釈。解釈できない値は null（= 絞り込まない）。 */
export function parseSince(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * keyset の WHERE 断片（昇順 `(順序キー, 決着キー)` の厳密な「より後ろ」）。
 *
 * `orderField` は表によって `updatedAt` / `createdAt`（不変の台帳）が入る。
 */
export function cursorWhere(
  cursor: Cursor | null,
  orderField = "updatedAt",
): Record<string, unknown> | null {
  if (!cursor) return null;
  const t = new Date(cursor.t);
  if (Number.isNaN(t.getTime())) return null;

  return {
    OR: [
      { [orderField]: { gt: t } },
      { [orderField]: t, id: { gt: cursor.id } },
    ],
  };
}

/** `?updatedSince=` の WHERE 断片。**境界を含む**（上のコメント参照）。 */
export function sinceWhere(
  since: Date | null,
  orderField = "updatedAt",
): Record<string, unknown> | null {
  return since ? { [orderField]: { gte: since } } : null;
}

/** null を落として AND でまとめる（空なら制約なし）。 */
export function andWhere(
  ...parts: (Record<string, unknown> | null | undefined)[]
): Record<string, unknown> {
  const kept = parts.filter(
    (p): p is Record<string, unknown> => p != null && Object.keys(p).length > 0,
  );
  if (kept.length === 0) return {};
  if (kept.length === 1) return kept[0];
  return { AND: kept };
}

/**
 * `limit + 1` 件取ってきた配列から 1 ページを組む。
 *
 * 「次があるか」を件数で判断するために 1 件多く引く — `count()` を別に撃つと
 * 2 クエリになるうえ、2 つのクエリの間に行が増減すると食い違う。
 */
export function takePage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => Cursor,
): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
  };
}
