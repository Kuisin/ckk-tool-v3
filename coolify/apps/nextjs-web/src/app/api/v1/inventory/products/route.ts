/**
 * GET /api/v1/inventory/products — 製品在庫の一覧（keyset + 差分同期）。
 *
 * 権限は `inventory:READ`。行スコープは保管拠点。
 * 「引当可能数」は返さない — `quantity - reservedQuantity` に見えるが、
 * 実際の判定は `lib/inventory-availability-core.ts` が半製品や予約の状態まで
 * 見て決める。ここで引き算を書くと画面と食い違うので、素の 2 値を返す。
 *
 * **仕掛品（半製品）も返す**（`isSemiFinished: true`）。その行の `productId` は
 * 目標製品で、在庫の品目そのもの（仕掛ブランク）ではない — 従来の契約のまま。
 * 仕掛品としての中身は `wipState`（加工状態 = 済んだ形を変える工程の並び）・
 * `aimedProductId`（目標製品。未分類で分からなければ null）・
 * `finishedDiameterMm` / `finishedLengthMm`（研削後の仕上がり寸法）で読む。
 * 完成品の行ではどれも null。
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
          AND: [
            // biome-ignore lint/suspicious/noExplicitAny: 断片は authz-core / pagination が組む
            where as any,
            {
              custodyBpId: null,
              // ownerBpId: null = 顧客の預り品（再研磨）も外す。
              ownerBpId: null,
              // 半製品は仕掛ブランクの行に移った（20261126200000_wip_backfill）。
              // 契約は変えない — 製品の在庫として、目標製品の id で返す。
              // wip-scope: **仕掛品も返す**（加工状態を持つ行 — DTO では
              // isSemiFinished: true）。このエンドポイントは前から半製品を印付きで
              // 返していて、完成品だけが欲しい側は isSemiFinished で落とす契約。
              // 印は DB の列ではなく wipStateId から導く（契約の形は変えない）。
              // （断片と AND で重ねる — 断片自身の AND / OR を潰さない）
              OR: [
                { item: { itemType: "PRODUCT" } },
                { wipStateId: { not: null } },
              ],
            },
          ],
        },
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          itemId: true,
          wipStateId: true,
          aimedItemId: true,
          finishedDiameterMm: true,
          finishedLengthMm: true,
          wipState: {
            select: { id: true, stepIds: true, name: true, isLegacy: true },
          },
          plantId: true,
          lotNumber: true,
          quantity: true,
          reservedQuantity: true,
          storageLocationId: true,
          shelfId: true,
          notes: true,
          updatedAt: true,
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.updatedAt.toISOString() }),
    toDto: (r) => {
      const isSemiFinished = r.wipStateId != null;
      return {
        id: r.id,
        productId: isSemiFinished ? (r.aimedItemId ?? r.itemId) : r.itemId,
        plantId: r.plantId,
        /** ロット = 指示書番号（QR `CKK:WO:<int>` と同じ値）。 */
        lotNumber: r.lotNumber,
        quantity: r.quantity,
        reservedQuantity: r.reservedQuantity,
        /** 半製品（仕掛品）か — 加工状態を持つ行。DB の列ではなく導いた値。 */
        isSemiFinished,
        /**
         * 加工状態（仕掛品だけ。完成品は null）。`stepIds` は済んだ形を変える工程
         * （process_step_catalog.id、早い順）。`isLegacy` = 未分類（移行で行き先を
         * 推定できなかった旧来の半製品）。`name` は任意の呼び名（多言語 JSON）。
         */
        wipState: r.wipState
          ? {
              id: r.wipState.id,
              stepIds: r.wipState.stepIds,
              name: r.wipState.name,
              isLegacy: r.wipState.isLegacy,
            }
          : null,
        /** 目標製品（items.id）。仕掛品だけ。 */
        aimedProductId: isSemiFinished ? r.aimedItemId : null,
        /** 研削後の仕上がり寸法（mm）。記録が無ければ null。 */
        finishedDiameterMm: r.finishedDiameterMm,
        finishedLengthMm: r.finishedLengthMm,
        storageLocationId: r.storageLocationId,
        shelfId: r.shelfId,
        notes: r.notes,
        updatedAt: iso(r.updatedAt),
      };
    },
  });
}
