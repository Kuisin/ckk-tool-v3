/**
 * data.ts — 素材入荷 (PU01) のサーバーサイド取得・マッピング。
 *
 * URL id = uuid。発注明細（purchaseOrderItem → purchaseOrder）を辿って
 * 発注番号を解決する（null = 直接調達）。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type { MaterialReceiptView } from "@/components/purchase/material-receipts/model";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export {
  fetchFactoryOptions,
  fetchSupplierOptions,
  type Option,
} from "../../production/work-orders/data";

const RECEIPT_INCLUDE = {
  material: true,
  factory: true,
  supplierBp: true,
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
    factoryName: r.factory
      ? `${r.factory.code} ${localized(r.factory.name as LocalizedText | null)}`
      : null,
    quantity: Number(r.quantity),
    unit: r.unit,
    receivedAt: r.receivedAt.toISOString().slice(0, 10),
    poNumber: r.purchaseOrderItem?.purchaseOrder.poNumber ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

/** 一覧 (PU01) — 入荷日の新しい順。 */
export async function fetchMaterialReceipts(): Promise<MaterialReceiptView[]> {
  const rows = await prisma.materialReceipt.findMany({
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
  const row = await findRow(id);
  return row ? mapReceipt(row) : null;
}
