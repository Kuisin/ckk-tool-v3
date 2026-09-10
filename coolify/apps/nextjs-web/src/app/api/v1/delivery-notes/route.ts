/**
 * GET /api/v1/delivery-notes — 納品書の一覧（keyset + 差分同期）。
 *
 * 権限は `delivery_note:READ`。行スコープは**親の出荷書の出荷元拠点**
 * ∪ 作成者（納品書自身は拠点を持たない）。
 */

import { ownOrPlantWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { iso, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "delivery_note", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: ownOrPlantWhere(gate.access, gate.ctx.userId, {
      ownColumn: "createdBy",
      // 拠点は出荷書が持つ。納品書からは関係を 1 段辿る。
      plantClause: (ids) => ({ deliveryOrder: { fromPlantId: { in: ids } } }),
    }),
    fetch: ({ where, take, orderBy }) =>
      prisma.deliveryNote.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          yearMonth: true,
          seq: true,
          deliveryOrderYearMonth: true,
          deliveryOrderSeq: true,
          status: true,
          deliveryMethod: true,
          recipientBpId: true,
          recipientBranchBpId: true,
          endUserBpId: true,
          includePrice: true,
          deliveredAt: true,
          notes: true,
          salesRepId: true,
          createdAt: true,
          updatedAt: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              notes: true,
            },
          },
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
      number: formatDocNumber("DRN", r),
      deliveryOrderNumber: formatDocNumber("DOR", {
        seq: r.deliveryOrderSeq,
        yearMonth: r.deliveryOrderYearMonth,
      }),
      status: r.status,
      deliveryMethod: r.deliveryMethod,
      recipientId: r.recipientBpId,
      recipientBranchId: r.recipientBranchBpId,
      endUserId: r.endUserBpId,
      includePrice: r.includePrice,
      deliveredAt: iso(r.deliveredAt),
      salesRepId: r.salesRepId,
      notes: r.notes,
      items: r.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: num(i.unitPrice),
        amount: num(i.amount),
        notes: i.notes,
      })),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
