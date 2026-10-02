/**
 * GET /api/v1/inventory/products — 製品在庫の一覧（keyset + 差分同期）。
 *
 * 権限は `inventory:READ`。行スコープは保管拠点。
 * 「引当可能数」は返さない — `quantity - reservedQuantity` に見えるが、
 * 実際の判定は `lib/inventory-availability-core.ts` が半製品や予約の状態まで
 * 見て決める。ここで引き算を書くと画面と食い違うので、素の 2 値を返す。
 *
 * `productId` の値は **`items.id`**（2026-09-20 の切り替え — `_specs/api.md` §6.1）。
 * 項目名は従来のままで、`/api/v1/products` の `id` と同じ id 空間を指す。
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
      prisma.itemInventory.findMany({
        // custodyBpId: null = **自社の在庫だけ**（外注への預けは手持ちでない）。
        where: {
          // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
          ...(where as any),
          custodyBpId: null,
          // ownerBpId: null = 顧客の預り品（再研磨）も外す。
          ownerBpId: null,
          item: { itemType: "PRODUCT" },
        },
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          itemId: true,
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
      productId: r.itemId,
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
