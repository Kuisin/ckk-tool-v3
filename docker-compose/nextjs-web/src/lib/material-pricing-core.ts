/**
 * material-pricing-core.ts — 参照価格の純粋計算（server/client 両用）.
 *
 * 試算の材料原価は素材マスタの静的価格ではなく仕入実績の参照価格を使う
 * (_specs/tables.md §見積試算)。算出方法（最高/最新/平均）と参照期間は
 * system_settings（lib/system-settings.ts）。データ取得は lib/material-pricing.ts。
 */

export interface MaterialPricePoint {
  /** ISO date of the purchase (PO ordered/purchase date). */
  date: string;
  /** 仕入単価 (¥/1000mm) — material_purchase_order_items.unit_price. */
  unitPrice: number;
  supplier: string;
  poNumber: string;
}

export type MaterialPriceBasis = "MAX" | "LATEST" | "AVERAGE";

export interface ReferencePriceResult {
  unitPrice: number;
  /** Representative date (the point that set the price for MAX/LATEST). */
  date: string;
  basis: MaterialPriceBasis;
  lookbackMonths: number;
  /** Points within the window (used for the basis). */
  windowPoints: MaterialPricePoint[];
  hasHistory: boolean;
}

export interface LatestMaterialPrice {
  unitPrice: number;
  date: string;
  supplier: string;
  poNumber: string;
  hasHistory: boolean;
}

/** Latest purchase price (most recent point). `hasHistory=false` → 0 fallback. */
export function latestMaterialPrice(
  points: MaterialPricePoint[],
): LatestMaterialPrice {
  if (points.length === 0) {
    return {
      unitPrice: 0,
      date: "",
      supplier: "",
      poNumber: "",
      hasHistory: false,
    };
  }
  const last = points[points.length - 1];
  return { ...last, hasHistory: true };
}

/**
 * 参照価格 — 直近 lookbackMonths ヶ月の仕入実績から basis で選ぶ。
 * anchor（既定: 最新実績日）から遡った窓に点がなければ全履歴へフォールバック。
 * `points` は日付昇順であること。
 */
export function computeReferencePrice(
  points: MaterialPricePoint[],
  basis: MaterialPriceBasis = "MAX",
  lookbackMonths = 6,
  anchor?: Date,
): ReferencePriceResult {
  if (points.length === 0) {
    return {
      unitPrice: 0,
      date: "",
      basis,
      lookbackMonths,
      windowPoints: [],
      hasHistory: false,
    };
  }
  const anchorDate = anchor ?? new Date(points[points.length - 1].date);
  const cutoff = new Date(anchorDate);
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  let windowPoints = points.filter((p) => new Date(p.date) >= cutoff);
  if (windowPoints.length === 0) windowPoints = points;

  let chosen: MaterialPricePoint;
  let unitPrice: number;
  if (basis === "AVERAGE") {
    unitPrice = Math.round(
      windowPoints.reduce((s, p) => s + p.unitPrice, 0) / windowPoints.length,
    );
    chosen = windowPoints[windowPoints.length - 1];
  } else if (basis === "LATEST") {
    chosen = windowPoints[windowPoints.length - 1];
    unitPrice = chosen.unitPrice;
  } else {
    chosen = windowPoints.reduce((a, b) => (b.unitPrice > a.unitPrice ? b : a));
    unitPrice = chosen.unitPrice;
  }
  return {
    unitPrice,
    date: chosen.date,
    basis,
    lookbackMonths,
    windowPoints,
    hasHistory: true,
  };
}
