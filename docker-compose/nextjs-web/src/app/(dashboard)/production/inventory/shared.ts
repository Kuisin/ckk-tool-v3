/**
 * shared.ts — 在庫 (PD04/PD05) 共通のサーバーサイド取得ヘルパ。
 *
 * 取引履歴（inventory_transactions）の参照を表示用ラベルへ解決する:
 * - work_order (uuid)   → 指示書番号 #N
 * - order_line (uuid)  → 注文明細番号 ORD-YYYYMM-NNNNN-NN
 * - shipping_order      → 参照値そのまま（SHP-… 文字列で保存済み）
 * - その他              → 参照 id そのまま
 * Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type { InventoryTransactionRow } from "@/components/production/inventory/model";
import { prisma } from "@/lib/db";
import { orderLineNumberOf } from "@/lib/doc-number";

/** 在庫行 1 件分の取引履歴（新しい順）を参照ラベル解決済みで返す。 */
export async function fetchInventoryTransactions(
  inventoryType: "PRODUCT" | "MATERIAL",
  inventoryId: string,
): Promise<InventoryTransactionRow[]> {
  const rows = await prisma.inventoryTransaction.findMany({
    where: { inventoryType, inventoryId },
    orderBy: { createdAt: "desc" },
  });

  // 参照 uuid → 文書番号の一括解決（work_order / order_line のみ uuid 保存）
  const woIds = new Set<string>();
  const soIds = new Set<string>();
  for (const r of rows) {
    if (!r.referenceId) continue;
    if (r.referenceType === "work_order") woIds.add(r.referenceId);
    if (r.referenceType === "order_line") soIds.add(r.referenceId);
  }
  const [workOrders, orderLines] = await Promise.all([
    woIds.size
      ? prisma.workOrder.findMany({
          where: { id: { in: [...woIds] } },
          select: { id: true, workOrderNumber: true },
        })
      : [],
    soIds.size
      ? prisma.orderLine.findMany({
          where: { id: { in: [...soIds] } },
          select: {
            id: true,
            acceptanceYearMonth: true,
            acceptanceSeq: true,
            branch: true,
          },
        })
      : [],
  ]);
  const woNumber = new Map(workOrders.map((w) => [w.id, w.workOrderNumber]));
  const soNumber = new Map(
    orderLines.map((s) => [s.id, orderLineNumberOf(s) ?? s.id]),
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
    if (type === "order_line") return soNumber.get(id) ?? id;
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
