/**
 * GET /api/v1/invoices — 請求書の一覧（keyset + 差分同期）。
 *
 * 権限は `invoice:READ`。行スコープは OWN のみ — 請求書から拠点へ辿る道は
 * 明細 → 注文明細 → 請書と遠く、絞り込みの意味が薄い（画面も同じ）。
 *
 * 税は**発行時のスナップショット**（taxType / taxRate）を持つ。過去の請求書を
 * 今の税率で読み直さないための列なので、そのまま返す。
 */

import { ownWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { dateOnly, iso, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { DOC_FIELDS_SELECT, docFields } from "../doc-fields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "invoice", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: ownWhere(gate.access, gate.ctx.userId, "createdBy"),
    fetch: ({ where, take, orderBy }) =>
      prisma.invoice.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          ...DOC_FIELDS_SELECT,
          status: true,
          customerBpId: true,
          customerBranchBpId: true,
          billingPeriodFrom: true,
          billingPeriodTo: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          taxType: true,
          taxRate: true,
          currency: true,
          issuedAt: true,
          dueDate: true,
          sentAt: true,
          accountingExportedAt: true,
          notes: true,
          salesRepId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    query,
    // 決着キーは行の uuid（索引 (updated_at, id)）。番号は法人をまたいで重なる。
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      ...docFields(r),
      status: r.status,
      customerId: r.customerBpId,
      customerBranchId: r.customerBranchBpId,
      billingPeriodFrom: dateOnly(r.billingPeriodFrom),
      billingPeriodTo: dateOnly(r.billingPeriodTo),
      subtotal: num(r.subtotal),
      taxAmount: num(r.taxAmount),
      totalAmount: num(r.totalAmount),
      /** 発行時点のスナップショット（今の税率ではない）。 */
      taxType: r.taxType,
      taxRate: num(r.taxRate),
      currency: r.currency,
      issuedAt: iso(r.issuedAt),
      dueDate: dateOnly(r.dueDate),
      sentAt: iso(r.sentAt),
      accountingExportedAt: iso(r.accountingExportedAt),
      salesRepId: r.salesRepId,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
