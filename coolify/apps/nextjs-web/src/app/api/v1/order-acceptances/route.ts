/**
 * GET /api/v1/order-acceptances — 注文請書の一覧（keyset + 差分同期）。
 *
 * 権限は `order_acceptance:READ`（**注文明細と同じコード** — 画面の粒度に
 * 合わせる。API の資源名ごとに新しいコードを作らない）。
 * 行スコープは画面（sales/order-acceptances/data.ts）と同じ `ownWhere`。
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
  const gate = await requireApiPermission(request, "order_acceptance", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: ownWhere(gate.access, gate.ctx.userId, "createdBy"),
    fetch: ({ where, take, orderBy }) =>
      prisma.orderAcceptance.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          yearMonth: true,
          seq: true,
          status: true,
          source: true,
          customerBpId: true,
          customerBranchBpId: true,
          shipToBpId: true,
          endUserBpId: true,
          assignedPlantId: true,
          customerOrderRef: true,
          currency: true,
          orderDate: true,
          deliveryMethod: true,
          salesRepId: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          archivedAt: true,
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
      number: formatDocNumber("ORD", r),
      status: r.status,
      customerId: r.customerBpId,
      customerName: localizedJson(r.customerBp?.name),
      customerBranchId: r.customerBranchBpId,
      shipToId: r.shipToBpId,
      assignedPlantId: r.assignedPlantId,
      endUserId: r.endUserBpId,
      customerOrderRef: r.customerOrderRef,
      // 合計金額は列ではなく明細から導出する値（lib/order-acceptance-totals.ts）。
      // ここで別の計算を書くと画面と食い違うので、明細の口から取ってもらう。
      currency: r.currency,
      orderDate: dateOnly(r.orderDate),
      deliveryMethod: r.deliveryMethod,
      source: r.source,
      salesRepId: r.salesRepId,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      completedAt: iso(r.completedAt),
      archivedAt: iso(r.archivedAt),
    }),
  });
}
