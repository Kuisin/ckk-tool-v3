/**
 * GET /api/v1/work-orders — 指示書の一覧（keyset + 差分同期）。
 *
 * 権限は `work_order:READ`。行スコープは**画面と同じ関数**
 * （`workOrderScopeWhere` — 工程の実施拠点 ∪ 作成者）を import して使う。
 * ここで独自に書くと、画面と API で見える範囲がずれる。
 *
 * 工程（`work_order_steps`）は**この資源の子**として返す。あの表は
 * `updated_at` も `created_at` も持たないので単独の差分同期に載せられず、
 * 親が動いたときに出し直すのが唯一正しい出し方（`_specs/api.md` §5.2）。
 */

import { workOrderScopeWhere } from "@/app/(dashboard)/production/work-orders/data";
import { requireApiPermission } from "@/lib/api-authz";
import { iso, localizedJson } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatDocNumber, formatProductNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `?steps=1` のときだけ工程を載せる（既定は載せない — 行が重くなるため）。 */
function wantsSteps(request: Request): boolean {
  const v = new URL(request.url).searchParams.get("steps");
  return v === "1" || v === "true";
}

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "work_order", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));
  const withSteps = wantsSteps(request);

  return runList({
    baseWhere: workOrderScopeWhere(gate.access, gate.ctx.userId) as Record<
      string,
      unknown
    >,
    fetch: ({ where, take, orderBy }) =>
      prisma.workOrder.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          workOrderNumber: true,
          yearMonth: true,
          seq: true,
          productId: true,
          type: true,
          plannedQuantity: true,
          materialId: true,
          storageLocationId: true,
          status: true,
          approvalStatus: true,
          requestedAt: true,
          approvedAt: true,
          startedAt: true,
          completedAt: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          product: { select: { name: true, yearMonth: true, seq: true } },
          orderLineLinks: {
            select: { orderLineId: true, quantity: true },
            orderBy: { sortOrder: "asc" },
          },
          ...(withSteps
            ? {
                steps: {
                  orderBy: { sortOrder: "asc" as const },
                  select: {
                    id: true,
                    processStepId: true,
                    sortOrder: true,
                    executionLocation: true,
                    plantId: true,
                    supplierBpId: true,
                    status: true,
                    inputQuantity: true,
                    outputSuccessQuantity: true,
                    outputDefectSemiFinished: true,
                    outputDefectScrap: true,
                    outputDefectRework: true,
                    startedAt: true,
                    completedAt: true,
                  },
                },
              }
            : {}),
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      /** ロット番号 = 業務キー（QR `CKK:WO:<int>` と同じ値）。 */
      lotNumber: r.workOrderNumber,
      /** 表示用の書類番号。 */
      number: formatDocNumber("WOR", r),
      status: r.status,
      approvalStatus: r.approvalStatus,
      type: r.type,
      productId: r.productId,
      productNumber: r.product
        ? formatProductNumber(r.product.yearMonth, r.product.seq)
        : null,
      productName: localizedJson(r.product?.name),
      plannedQuantity: r.plannedQuantity,
      materialId: r.materialId,
      storageLocationId: r.storageLocationId,
      orderLines: r.orderLineLinks.map((l) => ({
        orderLineId: l.orderLineId,
        quantity: l.quantity,
      })),
      ...("steps" in r && Array.isArray(r.steps)
        ? {
            steps: r.steps.map((s) => ({
              id: s.id,
              processStepId: s.processStepId,
              sortOrder: s.sortOrder,
              executionLocation: s.executionLocation,
              plantId: s.plantId,
              supplierId: s.supplierBpId,
              status: s.status,
              inputQuantity: s.inputQuantity,
              outputSuccessQuantity: s.outputSuccessQuantity,
              outputDefectSemiFinished: s.outputDefectSemiFinished,
              outputDefectScrap: s.outputDefectScrap,
              outputDefectRework: s.outputDefectRework,
              startedAt: iso(s.startedAt),
              completedAt: iso(s.completedAt),
            })),
          }
        : {}),
      notes: r.notes,
      requestedAt: iso(r.requestedAt),
      approvedAt: iso(r.approvedAt),
      startedAt: iso(r.startedAt),
      completedAt: iso(r.completedAt),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
