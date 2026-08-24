import "server-only";

/**
 * material-pricing.ts — 材種の材料価格ソース（server-only）.
 *
 * 試算の材料原価は「材種 × 直径 × 黒皮/研磨」で指定し、実際の仕入実績
 * （material_purchase_order_items × material_purchase_orders、status が
 * ORDERED/COMPLETED のもの — 当該構成の全素材を集計）の参照価格を使う。
 * 仕入実績が無いときは material_type_prices（¥/1000mm）の既定単価にフォール
 * バックする (_specs/tables.md §見積試算)。純粋計算は lib/material-pricing-core.ts、
 * ポリシーは lib/system-settings.ts。
 */

import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import {
  computeReferencePrice,
  type MaterialPricePoint,
  type ReferencePriceResult,
} from "./material-pricing-core";
import type { TrialPricingSettings } from "./trial-pricing-settings";

/** 材種構成のキー（材種 × 直径 × 黒皮/研磨）。 */
export interface MaterialTypeKey {
  materialTypeId: number;
  diameterCode: string;
  surfaceFinishCode: string;
}

/**
 * 仕入実績（日付昇順）。当該構成（材種 × 直径 × 黒皮/研磨）に一致する全素材の
 * ORDERED/COMPLETED 発注明細を集計する。
 */
export async function fetchPriceHistoryByType(
  key: MaterialTypeKey,
): Promise<MaterialPricePoint[]> {
  const items = await prisma.materialPurchaseOrderItem.findMany({
    where: {
      material: {
        materialTypeId: key.materialTypeId,
        diameterCode: key.diameterCode,
        surfaceFinishCode: key.surfaceFinishCode,
      },
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

/**
 * 材種の既定材料単価（¥/1000mm 基準）。(材種 × 直径 × 黒皮/研磨) で引く。
 * 未設定は 0。素材採番表由来のマトリクス（material_type_prices）。
 */
export async function fetchMaterialTypeDefaultPrice(
  key: MaterialTypeKey,
): Promise<number> {
  const p = await prisma.materialTypePrice.findUnique({
    where: {
      materialTypeId_diameterCode_surfaceFinishCode: {
        materialTypeId: key.materialTypeId,
        diameterCode: key.diameterCode,
        surfaceFinishCode: key.surfaceFinishCode,
      },
    },
    select: { unitPrice: true },
  });
  return p ? Number(p.unitPrice) : 0;
}

/**
 * 参照価格 — 仕入実績 × 価格ポリシー（system_settings）。実績が無いときは
 * 材種既定単価（¥/1000mm）にフォールバックする。
 */
export async function getReferencePriceByType(
  key: MaterialTypeKey,
  settings: Pick<
    TrialPricingSettings,
    | "materialPriceBasis"
    | "materialPriceLookbackMonths"
    | "defaultMaterialPrice"
  >,
): Promise<ReferencePriceResult> {
  const [history, typeDefault] = await Promise.all([
    fetchPriceHistoryByType(key),
    fetchMaterialTypeDefaultPrice(key),
  ]);
  return computeReferencePrice(
    history,
    settings.materialPriceBasis,
    settings.materialPriceLookbackMonths,
    undefined,
    typeDefault > 0 ? typeDefault : settings.defaultMaterialPrice,
  );
}
