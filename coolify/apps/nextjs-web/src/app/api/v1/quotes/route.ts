/**
 * GET /api/v1/quotes — 見積書の一覧（keyset + 差分同期）。
 *
 * 権限は `quote:READ`。行スコープは **OWN のみ**（`ownWhere`）—
 * `quotes` には拠点へ辿る関係が 1 本も無いので、PLANT スコープは
 * 表現できない（`_specs/api.md` §3）。画面（sales/quotes/data.ts）も同じ。
 *
 * **期限切れ（EXPIRED）は保存しない。** 「発行済み × 有効期限超過」から
 * その都度導くのが正で、列にはならない。ここでは status（DB の値）と
 * validUntil の両方を返し、判定は呼び出し側に委ねる — API が独自に
 * 導出すると画面と食い違う余地ができる。
 */

import { ownWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { dateOnly, iso, localizedJson } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "quote", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: ownWhere(gate.access, gate.ctx.userId, "createdBy"),
    fetch: ({ where, take, orderBy }) =>
      prisma.quote.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          yearMonth: true,
          seq: true,
          status: true,
          customerBpId: true,
          customerBranchBpId: true,
          validUntil: true,
          currency: true,
          notes: true,
          salesRepId: true,
          createdAt: true,
          updatedAt: true,
          customerBp: { select: { name: true } },
        },
      }),
    query,
    tiebreak: "doc",
    toCursor: (r) => ({
      kind: "doc",
      seq: r.seq,
      t: r.updatedAt.toISOString(),
      ym: r.yearMonth,
    }),
    toDto: (r) => ({
      number: formatDocNumber("QOT", r),
      status: r.status,
      customerId: r.customerBpId,
      customerName: localizedJson(r.customerBp?.name),
      customerBranchId: r.customerBranchBpId,
      validUntil: dateOnly(r.validUntil),
      currency: r.currency,
      salesRepId: r.salesRepId,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
