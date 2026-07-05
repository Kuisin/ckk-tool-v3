/**
 * _calc.ts — 試算の原価・単価計算（lib/pricing.ts 相当のプレビュー実装）
 *
 * 原価/本 = 材料費 + 加工時間/60 × 加工レート + 外注費 + 段取り費 ÷ 下限本数
 * 単価   = 原価 ÷ (1 − 利益率%)（10円単位切り上げ、調整単価で上書き可）
 */

export interface CostInputs {
  materialUnitCost: number;   // 材料費（¥/本）
  machiningMinutes: number;   // 加工時間（分/本）
  machiningRate: number;      // 加工レート（¥/時）
  outsourceCost: number;      // 外注費（¥/本）
  setupCost: number;          // 段取り費（¥・ロット按分）
  marginRate: number;         // 利益率（%）
}

export interface TierValues {
  minQuantity: number;
  maxQuantity: number | null; // null = 上限なし
  priceOverride: number | null; // 調整単価（null = 自動計算値を採用）
}

/** 原価/本（段取り費は数量区分の下限本数で按分） */
export function tierUnitCost(c: CostInputs, minQuantity: number): number {
  const machining = (c.machiningMinutes / 60) * c.machiningRate;
  const setup = minQuantity > 0 ? c.setupCost / minQuantity : c.setupCost;
  return c.materialUnitCost + machining + c.outsourceCost + setup;
}

/** 自動計算単価: 原価 ÷ (1 − 利益率)、10円単位切り上げ */
export function suggestedUnitPrice(cost: number, marginRate: number): number {
  if (marginRate >= 100) return 0;
  return Math.ceil(cost / (1 - marginRate / 100) / 10) * 10;
}

/** 採用単価（調整単価があれば優先） */
export function effectiveUnitPrice(c: CostInputs, tier: TierValues): number {
  return tier.priceOverride ?? suggestedUnitPrice(tierUnitCost(c, tier.minQuantity), c.marginRate);
}

/** 粗利率（%）: (単価 − 原価) ÷ 単価 */
export function grossMarginRate(unitPrice: number, unitCost: number): number {
  if (unitPrice <= 0) return 0;
  return ((unitPrice - unitCost) / unitPrice) * 100;
}

/** 数量範囲表示: 「100〜499本」「500本〜」 */
export function quantityRangeLabel(min: number, max: number | null): string {
  return max == null ? `${min}本〜` : `${min}〜${max}本`;
}
