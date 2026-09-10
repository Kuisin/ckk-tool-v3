/**
 * GET /api/v1/inventory/products — 製品在庫の一覧（keyset + 差分同期）。
 *
 * 権限は `inventory:READ`。行スコープは保管拠点。
 * 「引当可能数」は返さない — `quantity - reservedQuantity` に見えるが、
 * 実際の判定は `lib/inventory-availability-core.ts` が半製品や予約の状態まで
 * 見て決める。ここで引き算を書くと画面と食い違うので、素の 2 値を返す。
 */

import { plantWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { iso } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "inventory", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: plantWhere(gate.access, "plantId"),
    fetch: ({ where, take, orderBy }) =>
      prisma.productInventory.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          productId: true,
          plantId: true,
          lotNumber: true,
          quantity: true,
          reservedQuantity: true,
          isSemiFinished: true,
          storageLocationId: true,
          shelfId: true,
          notes: true,
          updatedAt: true,
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      productId: r.productId,
      plantId: r.plantId,
      /** ロット = 指示書番号（QR `CKK:WO:<int>` と同じ値）。 */
      lotNumber: r.lotNumber,
      quantity: r.quantity,
      reservedQuantity: r.reservedQuantity,
      isSemiFinished: r.isSemiFinished,
      storageLocationId: r.storageLocationId,
      shelfId: r.shelfId,
      notes: r.notes,
      updatedAt: iso(r.updatedAt),
    }),
  });
}
