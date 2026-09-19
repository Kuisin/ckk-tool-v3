/**
 * GET /api/v1/inventory/materials — 素材在庫の一覧（keyset + 差分同期）。
 * 権限は `inventory:READ`。行スコープは保管拠点。
 */

import { plantWhere } from "@ckk/authz-core";
import { requireApiPermission } from "@/lib/api-authz";
import { iso, num } from "@/lib/api-dto";
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
      (async () => {
        // 在庫は 1 表（app.item_inventory）になった。**外部契約は変えない**ので、
        // DTO の materialId は品目 → 旧マスタの対応をまとめて引いて詰め直す
        // （1 回だけ。行ごとに引くと N+1）。第 2 段で DTO を品目に寄せるまでの橋。
        const rows = await prisma.itemInventory.findMany({
          // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
          where: { ...(where as any), item: { itemType: "MATERIAL" } },
          take,
          // biome-ignore lint/suspicious/noExplicitAny: 同上
          orderBy: orderBy as any,
          select: {
            id: true,
            itemId: true,
            plantId: true,
            quantity: true,
            reservedQuantity: true,
            unit: true,
            storageLocationId: true,
            shelfId: true,
            notes: true,
            updatedAt: true,
          },
        });
        const ids = [...new Set(rows.map((r) => r.itemId))];
        const masters = ids.length
          ? await prisma.material.findMany({
              where: { itemId: { in: ids } },
              select: { id: true, itemId: true },
            })
          : [];
        const byItem = new Map(masters.map((m) => [m.itemId as number, m.id]));
        return rows.map((r) => ({
          ...r,
          materialId: byItem.get(r.itemId) ?? null,
        }));
      })(),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      materialId: r.materialId,
      plantId: r.plantId,
      quantity: num(r.quantity),
      reservedQuantity: num(r.reservedQuantity),
      unit: r.unit,
      storageLocationId: r.storageLocationId,
      shelfId: r.shelfId,
      notes: r.notes,
      updatedAt: iso(r.updatedAt),
    }),
  });
}
