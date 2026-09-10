/**
 * GET /api/v1/delivery-orders — 出荷書の一覧（keyset + 差分同期）。
 *
 * 権限は `delivery_order:READ`。行スコープは出荷元拠点 ∪ 作成者。
 *
 * ★ **この表だけはアプリ内で物理削除される**（下書きのみ・
 * `deleteDeliveryOrder`）。消えた行は差分同期からは見えないので、
 * `GET /api/v1/deletions` を併せて引くこと（`_specs/api.md` §5.3）。
 */

import { ownOrPlantWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { iso } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "delivery_order", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: ownOrPlantWhere(gate.access, gate.ctx.userId, {
      ownColumn: "createdBy",
      plantColumn: "fromPlantId",
    }),
    fetch: ({ where, take, orderBy }) =>
      prisma.deliveryOrder.findMany({
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
          workOrderId: true,
          fromPlantId: true,
          shippedAt: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              productId: true,
              orderLineId: true,
              lotNumber: true,
              quantity: true,
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
      number: formatDocNumber("DOR", r),
      status: r.status,
      customerId: r.customerBpId,
      customerBranchId: r.customerBranchBpId,
      workOrderId: r.workOrderId,
      fromPlantId: r.fromPlantId,
      shippedAt: iso(r.shippedAt),
      notes: r.notes,
      // 明細は時刻列を持たないのでヘッダの子として出す（単独の差分同期は無い）。
      items: r.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        orderLineId: i.orderLineId,
        lotNumber: i.lotNumber,
        quantity: i.quantity,
        notes: i.notes,
      })),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
