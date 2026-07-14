/**
 * shared.ts — 在庫 (PD04/PD05) 共通のサーバーサイド取得ヘルパ。
 *
 * 取引履歴（inventory_transactions）の参照を表示用ラベルへ解決する:
 * - work_order (uuid)   → 指示書番号 #N
 * - sales_order (uuid)  → 注文請書番号 ORD-YYYYMM-NNNNN-NN
 * - shipping_order      → 参照値そのまま（SHP-… 文字列で保存済み）
 * - その他              → 参照 id そのまま
 * Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type { InventoryTransactionRow } from "@/components/production/inventory/model";
import { prisma } from "@/lib/db";
import { formatSalesOrderNumber } from "@/lib/doc-number";

/** 在庫行 1 件分の取引履歴（新しい順）を参照ラベル解決済みで返す。 */
export async function fetchInventoryTransactions(
  inventoryType: "PRODUCT" | "MATERIAL",
  inventoryId: string,
): Promise<InventoryTransactionRow[]> {
  const rows = await prisma.inventoryTransaction.findMany({
    where: { inventoryType, inventoryId },
    orderBy: { createdAt: "desc" },
  });

  // 参照 uuid → 文書番号の一括解決（work_order / sales_order のみ uuid 保存）
  const woIds = new Set<string>();
  const soIds = new Set<string>();
  for (const r of rows) {
    if (!r.referenceId) continue;
    if (r.referenceType === "work_order") woIds.add(r.referenceId);
    if (r.referenceType === "sales_order") soIds.add(r.referenceId);
  }
  const [workOrders, salesOrders] = await Promise.all([
    woIds.size
      ? prisma.workOrder.findMany({
          where: { id: { in: [...woIds] } },
          select: { id: true, workOrderNumber: true },
        })
      : [],
    soIds.size
      ? prisma.salesOrder.findMany({
          where: { id: { in: [...soIds] } },
          select: { id: true, yearMonth: true, seq: true, branch: true },
        })
      : [],
  ]);
  const woNumber = new Map(workOrders.map((w) => [w.id, w.workOrderNumber]));
  const soNumber = new Map(
    salesOrders.map((s) => [s.id, formatSalesOrderNumber(s)]),
  );

  const referenceLabel = (
    type: string | null,
    id: string | null,
  ): string | null => {
    if (!type || !id) return null;
    if (type === "work_order") {
      const n = woNumber.get(id);
      return n != null ? `#${n}` : id;
    }
    if (type === "sales_order") return soNumber.get(id) ?? id;
    // shipping_order は SHP-… 文字列で保存済み。その他はそのまま。
    return id;
  };

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    transactionType: r.transactionType,
    quantity: Number(r.quantity),
    referenceType: r.referenceType,
    referenceLabel: referenceLabel(r.referenceType, r.referenceId),
    notes: r.notes,
  }));
}
