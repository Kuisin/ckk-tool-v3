/**
 * GET /api/v1/billing-closings — 締日処理の一覧（keyset + 差分同期）。
 *
 * 権限は `billing_closing:READ`。顧客単位の処理で拠点を持たないため
 * 行スコープは掛けない（画面も一覧は全件）。
 *
 * この表は `updated_at` を持っていなかった（PENDING → PROCESSED → EXPORTED と
 * 状態が動くのに、時刻は per-status の nullable だけ）。差分同期に載せるために
 * 追加した列で並べている。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { dateOnly, iso, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "billing_closing", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: {},
    fetch: ({ where, take, orderBy }) =>
      prisma.billingClosing.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          customerBpId: true,
          closingDate: true,
          status: true,
          totalAmount: true,
          invoiceYearMonth: true,
          invoiceSeq: true,
          processedAt: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      customerId: r.customerBpId,
      closingDate: dateOnly(r.closingDate),
      status: r.status,
      totalAmount: num(r.totalAmount),
      invoiceNumber:
        r.invoiceYearMonth && r.invoiceSeq !== null
          ? formatDocNumber("INV", {
              seq: r.invoiceSeq,
              yearMonth: r.invoiceYearMonth,
            })
          : null,
      processedAt: iso(r.processedAt),
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
