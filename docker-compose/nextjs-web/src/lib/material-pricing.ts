/**
 * material-pricing.ts — 素材の仕入実績価格 (購買履歴) ソース.
 *
 * 試算の材料原価は「素材マスタの静的価格」ではなく、実際の仕入実績の最新単価を
 * 使う (最新情報を反映)。ここでは購買履歴をデモ時系列として保持する。
 *
 * MIGRATION NOTE: replace MATERIAL_PURCHASE_HISTORY with a query joining
 * `material_purchase_order_items` → `material_purchase_orders` (status ∈
 * {ORDERED, COMPLETED}) ordered by `ordered_at`/`purchase_date`. `getPriceHistory`
 * / `getLatestMaterialPrice` keep the same shape, so callers/UI need no change.
 */

export interface MaterialPricePoint {
  /** ISO date of the purchase (PO ordered/received). */
  date: string;
  /** 仕入単価 (¥ / bar) — material_purchase_order_items.unit_price. */
  unitPrice: number;
  supplier: string;
  /** 発注番号 (reference). */
  poNumber: string;
}

/** Purchase-price history per material id (ascending by date). */
export const MATERIAL_PURCHASE_HISTORY: Record<string, MaterialPricePoint[]> = {
  "A01A0001-A001-001": [
    {
      date: "2025-07-10",
      unitPrice: 14800,
      supplier: "アクシス",
      poNumber: "PO-202507-00012",
    },
    {
      date: "2025-09-22",
      unitPrice: 15200,
      supplier: "アクシス",
      poNumber: "PO-202509-00031",
    },
    {
      date: "2025-12-05",
      unitPrice: 15640,
      supplier: "アクシス",
      poNumber: "PO-202512-00008",
    },
    {
      date: "2026-03-18",
      unitPrice: 16263,
      supplier: "アクシス",
      poNumber: "PO-202603-00020",
    },
    {
      date: "2026-05-27",
      unitPrice: 16980,
      supplier: "アクシス",
      poNumber: "PO-202605-00014",
    },
  ],
  "A02B0014-B001-002": [
    {
      date: "2025-08-02",
      unitPrice: 9200,
      supplier: "AFC",
      poNumber: "PO-202508-00005",
    },
    {
      date: "2025-11-14",
      unitPrice: 9550,
      supplier: "AFC",
      poNumber: "PO-202511-00019",
    },
    {
      date: "2026-02-09",
      unitPrice: 9880,
      supplier: "AFC",
      poNumber: "PO-202602-00011",
    },
    {
      date: "2026-05-03",
      unitPrice: 10250,
      supplier: "AFC",
      poNumber: "PO-202605-00007",
    },
  ],
  "B01A0007-A002-001": [
    {
      date: "2025-06-20",
      unitPrice: 6100,
      supplier: "GESAC",
      poNumber: "PO-202506-00009",
    },
    {
      date: "2025-10-08",
      unitPrice: 6050,
      supplier: "GESAC",
      poNumber: "PO-202510-00022",
    },
    {
      date: "2026-01-30",
      unitPrice: 6300,
      supplier: "GESAC",
      poNumber: "PO-202601-00016",
    },
    {
      date: "2026-04-21",
      unitPrice: 6480,
      supplier: "GESAC",
      poNumber: "PO-202604-00013",
    },
  ],
};

/** Full purchase-price history for a material (ascending by date; [] if none). */
export function getPriceHistory(materialId: string): MaterialPricePoint[] {
  return MATERIAL_PURCHASE_HISTORY[materialId] ?? [];
}

export interface LatestMaterialPrice {
  unitPrice: number;
  date: string;
  supplier: string;
  poNumber: string;
  hasHistory: boolean;
}

/** Latest purchase price (most recent point). `hasHistory=false` → 0 fallback. */
export function getLatestMaterialPrice(
  materialId: string,
): LatestMaterialPrice {
  const h = getPriceHistory(materialId);
  if (h.length === 0) {
    return {
      unitPrice: 0,
      date: "",
      supplier: "",
      poNumber: "",
      hasHistory: false,
    };
  }
  const last = h[h.length - 1];
  return { ...last, hasHistory: true };
}

// ── Reference price policy (system setting; see lib/trial-pricing-settings.ts) ─

export type MaterialPriceBasis = "MAX" | "LATEST" | "AVERAGE";

export interface ReferencePriceResult {
  /** Resolved reference price used for the calc default. */
  unitPrice: number;
  /** Representative date (the point that set the price for MAX/LATEST). */
  date: string;
  basis: MaterialPriceBasis;
  lookbackMonths: number;
  /** Points within the window (used for the basis). */
  windowPoints: MaterialPricePoint[];
  hasHistory: boolean;
}

/**
 * Default reference price for 試算 — per the system pricing policy.
 * Default policy: 直近 N=6 ヶ月の仕入で最高単価 (MAX). Window is anchored to the
 * most recent purchase date so the demo is deterministic; if no point falls in
 * the window it falls back to all history.
 *
 * MIGRATION NOTE: anchor the window to "today" once live (new Date()).
 */
export function getReferencePrice(
  materialId: string,
  basis: MaterialPriceBasis = "MAX",
  lookbackMonths = 6,
): ReferencePriceResult {
  const h = getPriceHistory(materialId);
  if (h.length === 0) {
    return {
      unitPrice: 0,
      date: "",
      basis,
      lookbackMonths,
      windowPoints: [],
      hasHistory: false,
    };
  }
  const anchor = new Date(h[h.length - 1].date);
  const cutoff = new Date(anchor);
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  let windowPoints = h.filter((p) => new Date(p.date) >= cutoff);
  if (windowPoints.length === 0) windowPoints = h;

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
    // MAX
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
