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
 * 決着キーは表によって 2 種類ある:
 *   - `id`                … uuid / 連番 int の表
 *   - `yearMonth` + `seq` … 書類（複合 PK。**書類番号は導出値で列に無い**）
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

/** uuid / int PK の表のカーソル位置。 */
export interface IdCursor {
  kind: "id";
  /** 順序キーの値（ISO 8601）。 */
  t: string;
  id: string;
}

/** 書類（複合 PK）のカーソル位置。 */
export interface DocCursor {
  kind: "doc";
  t: string;
  ym: string;
  seq: number;
}

export type Cursor = IdCursor | DocCursor;

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
      return typeof o.t === "string" && typeof o.id === "string"
        ? { kind: "id", t: o.t, id: o.id }
        : null;
    }
    if (o.kind === "doc") {
      return typeof o.t === "string" &&
        typeof o.ym === "string" &&
        Number.isInteger(o.seq)
        ? { kind: "doc", t: o.t, ym: o.ym, seq: o.seq }
        : null;
    }
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

  if (cursor.kind === "id") {
    return {
      OR: [
        { [orderField]: { gt: t } },
        { [orderField]: t, id: { gt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { [orderField]: { gt: t } },
      {
        [orderField]: t,
        OR: [
          { yearMonth: { gt: cursor.ym } },
          { yearMonth: cursor.ym, seq: { gt: cursor.seq } },
        ],
      },
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
