/**
 * GET /api/v1/order-lines — 注文明細の一覧（keyset + 差分同期）。
 *
 * 権限は `order_acceptance:READ`（注文請書と同じコード — 明細は請書の行で、
 * 画面もその粒度で閉じている）。
 *
 * 行スコープは**親の注文請書の作成者**で決まる（明細に createdBy は無い）。
 * 画面（sales/order-lines/data.ts）と同じ考え方。
 */

import { ownWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { dateOnly, iso, localizedJson, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber, formatProductNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "order_acceptance", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  // 明細そのものは作成者を持たないので、親の請書のスコープを継承する。
  const parentScope = ownWhere(gate.access, gate.ctx.userId, "createdBy");
  const baseWhere =
    Object.keys(parentScope).length === 0 ? {} : { acceptance: parentScope };

  return runList({
    baseWhere,
    fetch: ({ where, take, orderBy }) =>
      prisma.orderLine.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          acceptanceYearMonth: true,
          acceptanceSeq: true,
          branch: true,
          sortOrder: true,
          productId: true,
          productText: true,
          orderType: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          priceOverridden: true,
          deliveryDate: true,
          status: true,
          lotNumber: true,
          isLocked: true,
          endUserBpId: true,
          notes: true,
          confirmedAt: true,
          cancelledAt: true,
          createdAt: true,
          updatedAt: true,
          product: { select: { name: true, yearMonth: true, seq: true } },
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      // 明細の公開識別子は `ORD-YYYYMM-NNNNN-NN`。未確定は枝番が無い。
      number:
        r.branch === null
          ? null
          : `${formatDocNumber("ORD", {
              yearMonth: r.acceptanceYearMonth,
              seq: r.acceptanceSeq,
            })}-${String(r.branch).padStart(2, "0")}`,
      acceptanceNumber: formatDocNumber("ORD", {
        yearMonth: r.acceptanceYearMonth,
        seq: r.acceptanceSeq,
      }),
      branch: r.branch,
      sortOrder: r.sortOrder,
      status: r.status,
      productId: r.productId,
      productNumber: r.product
        ? formatProductNumber(r.product.yearMonth, r.product.seq)
        : null,
      productName: localizedJson(r.product?.name),
      /** 突合前の生の品名（抽出そのまま）。突合できた行では null のことが多い。 */
      productText: r.productText,
      orderType: r.orderType,
      quantity: r.quantity,
      unitPrice: num(r.unitPrice),
      amount: num(r.amount),
      priceOverridden: r.priceOverridden,
      deliveryDate: dateOnly(r.deliveryDate),
      lotNumber: r.lotNumber,
      isLocked: r.isLocked,
      endUserId: r.endUserBpId,
      notes: r.notes,
      confirmedAt: iso(r.confirmedAt),
      cancelledAt: iso(r.cancelledAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
