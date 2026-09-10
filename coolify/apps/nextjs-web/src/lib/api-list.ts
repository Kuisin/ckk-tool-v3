/**
 * api-list.ts — 一覧の口の共通部分（keyset + 差分同期 + 封筒）。server-only.
 *
 * ■ `syncedAt` は**必ず DB の時計**から採る
 *
 * 呼び出し側の時計から作らせると、ずれた分の行が永久に失われる（機械の時計は
 * ずれる — NTP が効いていない箱、コンテナの時刻ドリフト）。しかも失われた
 * ことが誰にも観測できない。
 *
 * ここではデータの取得と `now()` を**同じトランザクション**で撃つ。
 * READ COMMITTED の `now()` は**トランザクション開始時刻**なので、その後に
 * 更新された行は次回の `?updatedSince=` に必ず入る。境界も `>=` なので、
 * 取りこぼしではなく**二重配送**の側へ倒れる（_specs/api.md §5）。
 */

import "server-only";

import {
  andWhere,
  type Cursor,
  cursorWhere,
  decodeCursor,
  parseLimit,
  parseSince,
  sinceWhere,
  takePage,
} from "./api-pagination-core";
import { problemResponse } from "./api-problem";
import { jsonList } from "./api-response";
import { prisma } from "./db";

export interface ListQuery {
  limit: number;
  cursor: Cursor | null;
  since: Date | null;
  /** カーソルは渡されたが壊れていた（呼び出し側は 400 にする）。 */
  badCursor: boolean;
}

export function parseListQuery(request: Request): ListQuery {
  const p = new URL(request.url).searchParams;
  const rawCursor = p.get("cursor");
  const cursor = decodeCursor(rawCursor);
  return {
    badCursor: Boolean(rawCursor) && cursor === null,
    cursor,
    limit: parseLimit(p.get("limit")),
    since: parseSince(p.get("updatedSince")),
  };
}

/** 壊れたカーソルは**黙って先頭に戻さない** — 静かに全件を読み直すことになる。 */
export function invalidCursorResponse(instance: string): Response {
  return problemResponse({
    code: "invalid_cursor",
    detail: "The cursor is not valid. Start a new sync without it.",
    instance,
  });
}

export interface RunListOptions<Row, Dto> {
  query: ListQuery;
  /** 順序キー。不変の台帳だけ `createdAt`。 */
  orderField?: "updatedAt" | "createdAt";
  /** 権限・業務条件の where（行スコープを含む）。 */
  baseWhere: Record<string, unknown>;
  /** `where` と `take` を受けて 1 ページ + 1 件を引く。 */
  fetch: (args: {
    where: Record<string, unknown>;
    take: number;
    orderBy: Record<string, "asc">[];
  }) => Promise<Row[]>;
  /** 行 → カーソル位置。 */
  toCursor: (row: Row) => Cursor;
  /** 行 → 応答の形。 */
  toDto: (row: Row) => Dto;
  /** 決着キーの並び順（`id` か `yearMonth,seq`）。 */
  tiebreak: "id" | "doc";
}

export async function runList<Row, Dto>(
  o: RunListOptions<Row, Dto>,
): Promise<Response> {
  const orderField = o.orderField ?? "updatedAt";
  const where = andWhere(
    o.baseWhere,
    sinceWhere(o.query.since, orderField),
    cursorWhere(o.query.cursor, orderField),
  );
  const orderBy: Record<string, "asc">[] =
    o.tiebreak === "doc"
      ? [{ [orderField]: "asc" }, { yearMonth: "asc" }, { seq: "asc" }]
      : [{ [orderField]: "asc" }, { id: "asc" }];

  // データと now() を同じトランザクションで。**呼び出し側の時計は使わない。**
  const [rows, clock] = await prisma.$transaction([
    // biome-ignore lint/suspicious/noExplicitAny: fetch は呼び出し側の Prisma delegate
    o.fetch({ orderBy, take: o.query.limit + 1, where }) as any,
    prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`,
  ]);

  const page = takePage(rows as Row[], o.query.limit, o.toCursor);
  const syncedAt = (clock as { now: Date }[])[0]?.now ?? new Date();

  return jsonList(
    page.data.map(o.toDto),
    { hasMore: page.hasMore, nextCursor: page.nextCursor },
    syncedAt,
  );
}
