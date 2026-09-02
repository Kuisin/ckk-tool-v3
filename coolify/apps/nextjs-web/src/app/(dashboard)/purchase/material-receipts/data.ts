/**
 * data.ts — 素材入荷 (PU03) のサーバーサイド取得・マッピング。
 *
 * URL id = uuid。発注明細（purchaseOrderItem → purchaseOrder）を辿って
 * 発注番号を解決する（null = 直接調達）。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type { MaterialReceiptView } from "@/components/purchase/material-receipts/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

export {
  fetchPlantOptions,
  fetchSupplierOptions,
  type Option,
} from "../../production/work-orders/data";

const RECEIPT_INCLUDE = {
  material: true,
  plant: true,
  supplierBp: true,
  createdByUser: { select: { displayName: true } },
  purchaseOrderItem: {
    include: { purchaseOrder: { select: { poNumber: true } } },
  },
};

function findRow(id: string) {
  return prisma.materialReceipt.findUnique({
    where: { id },
    include: RECEIPT_INCLUDE,
  });
}

type ReceiptRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function mapReceipt(r: ReceiptRow): MaterialReceiptView {
  return {
    id: r.id,
    materialId: String(r.materialId),
    materialCode: r.material.code,
    materialName: localized(r.material.name as LocalizedText | null),
    supplierName: r.supplierBp
      ? localized(r.supplierBp.name as LocalizedText | null)
      : null,
    plantName: r.plant
      ? `${r.plant.code} ${localized(r.plant.name as LocalizedText | null)}`
      : null,
    quantity: Number(r.quantity),
    unit: r.unit,
    receivedAt: r.receivedAt.toISOString().slice(0, 10),
    poNumber: r.purchaseOrderItem?.purchaseOrder.poNumber ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

/** 一覧 (PU03) — 入荷日の新しい順。スコープ（監査 M3）: 入荷先拠点 OR OWN。 */
export async function fetchMaterialReceipts(): Promise<MaterialReceiptView[]> {
  const authz = await checkPermission("material_receipt", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.materialReceipt.findMany({
    take: LIST_FETCH_CAP,
    where: ownOrPlantWhere(authz.access, authz.userId, {
      plantColumn: "plantId",
      ownColumn: "createdBy",
    }) as Prisma.MaterialReceiptWhereInput,
    include: RECEIPT_INCLUDE,
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapReceipt);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 1件取得 — uuid 形式不正・未存在は null。 */
export async function fetchMaterialReceipt(
  id: string,
): Promise<MaterialReceiptView | null> {
  if (!UUID_RE.test(id)) return null;
  const authz = await checkPermission("material_receipt", "READ");
  if (!authz.ok) return null;
  const row = await findRow(id);
  if (!row) return null;
  if (
    !rowInScope(
      authz.access,
      { plantIds: [row.plantId], createdBy: row.createdBy },
      authz.userId,
    )
  ) {
    return null;
  }
  return mapReceipt(row);
}

/**
 * 逆リンク — その素材発注書から起きた入荷（素材発注書詳細の「次の書類へ」）。
 *
 * 入荷は発注**明細**にぶら下がるので、発注書 1 件で複数行になる。入荷日の
 * 新しい順（同日は作成順）で返す。
 */
export async function fetchReceiptsForPurchaseOrder(
  purchaseOrderId: string,
): Promise<MaterialReceiptView[]> {
  if (!UUID_RE.test(purchaseOrderId)) return [];
  const rows = await prisma.materialReceipt.findMany({
    where: { purchaseOrderItem: { purchaseOrderId } },
    include: RECEIPT_INCLUDE,
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapReceipt);
}
