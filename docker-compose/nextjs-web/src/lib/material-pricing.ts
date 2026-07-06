import "server-only";

/**
 * material-pricing.ts — 素材の仕入実績価格ソース（server-only）.
 *
 * 試算の材料原価は素材マスタの静的価格ではなく、実際の仕入実績
 * （material_purchase_order_items × material_purchase_orders、status が
 * ORDERED/COMPLETED のもの）の参照価格を使う (_specs/tables.md §見積試算)。
 * 純粋計算は lib/material-pricing-core.ts、ポリシーは lib/system-settings.ts。
 */

import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import {
  computeReferencePrice,
  type MaterialPricePoint,
  type ReferencePriceResult,
} from "./material-pricing-core";
import type { TrialPricingSettings } from "./trial-pricing-settings";

/** 仕入実績（日付昇順）。ORDERED/COMPLETED の発注明細のみ。 */
export async function fetchPriceHistory(
  materialId: number,
): Promise<MaterialPricePoint[]> {
  const items = await prisma.materialPurchaseOrderItem.findMany({
    where: {
      materialId,
      purchaseOrder: { status: { in: ["ORDERED", "COMPLETED"] } },
    },
    include: { purchaseOrder: { include: { supplierBp: true } } },
  });
  return items
    .map((it) => {
      const po = it.purchaseOrder;
      const date = (po.orderedAt ?? po.purchaseDate ?? po.createdAt)
        .toISOString()
        .slice(0, 10);
      return {
        date,
        unitPrice: Number(it.unitPrice),
        supplier: localized(po.supplierBp.name as LocalizedText | null),
        poNumber: po.poNumber,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 参照価格 — 仕入実績 × 価格ポリシー（system_settings）。 */
export async function getReferencePrice(
  materialId: number,
  settings: Pick<
    TrialPricingSettings,
    "materialPriceBasis" | "materialPriceLookbackMonths"
  >,
): Promise<ReferencePriceResult> {
  const history = await fetchPriceHistory(materialId);
  return computeReferencePrice(
    history,
    settings.materialPriceBasis,
    settings.materialPriceLookbackMonths,
  );
}
