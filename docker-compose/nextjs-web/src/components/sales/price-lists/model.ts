/**
 * model.ts — 価格表 view-model types + pure display/pricing helpers.
 *
 * Model (per sales.price_list_entries — combined key (year_month, seq)):
 *   Entry — 表示番号 PRC-YYYYMM-NNNNN はキーから導出（URL id と同一）。
 *           (顧客, 製品, 注文種別) は作成後不変の識別（unique）.
 *           Owns 基準単価 (試算の見積単価、手動上書き可) + 有効期間 + 通貨 + 状態.
 *     └ Tier     = 数量範囲 → 倍率 (×1.01 など)。単価 = 基準単価 × 倍率、
 *                  行ごとに手動上書き (priceOverride) 可。
 *     └ Discount = 期間 × 数量条件 → 値引きルール（専用リスト）。
 *
 * 価格表は試算からのみ作成する（基準単価は試算値を直接使うか手動上書き）。
 * 見積書は価格表からのみ価格を解決する（単価・値引きとも自動計算）。
 * Rows are built by the server pages (app/sales/price-lists/data.ts);
 * everything here is pure and client-safe.
 */

import { formatDate, formatMoney } from "@/lib/format";

/**
 * One quantity tier: 数量範囲 → 倍率。
 * 単価 = round(基準単価 × multiplier)、`priceOverride` で行ごとに手動上書き可.
 */
export interface PriceTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  /** 数量倍率 (例 1.05 = 基準単価の5%増し, 1.00 = 基準どおり). */
  multiplier: number;
  /** 手動上書き単価（null = 倍率から自動計算）. */
  priceOverride: number | null;
}

/**
 * 値引きルール — 期間 × 数量条件 → 値引き（entry ごとの専用リスト）.
 *   RATE   = 単価に対する率 (%)
 *   AMOUNT = 1本あたりの値引き額 (¥/本)
 * 条件（数量範囲・有効期間）を満たすルールのうち、1本あたりの値引きが最大の
 * ものが適用される（sales.price_list_discounts）。
 */
export interface PriceDiscount {
  id: string;
  /** 名称（例: 夏季キャンペーン）. */
  label: string;
  discountType: "RATE" | "AMOUNT";
  /** RATE: %（0–100） / AMOUNT: ¥/本. */
  value: number;
  minQuantity: number;
  maxQuantity: number | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
}

/** A price entry — owns the period shared by its tiers. */
export interface PriceListEntry {
  /** 価格表番号 PRC-YYYYMM-NNNNN（URL id と同一）。 */
  entryId: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  orderType: string;
  currency: string;
  /**
   * 基準単価 — 試算の見積単価から登録（そのまま使うか手動上書き）。
   * 各 tier の単価はここから倍率で計算される。
   */
  baseUnitPrice: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  tiers: PriceTier[];
  /** 期間・数量条件つき値引きルール（専用リスト）. */
  discounts: PriceDiscount[];
  /** 試算元の文書番号 EST-…（手動追加種別のみ null）— URL id と同一。 */
  estimateId: string | null;
  estimateNumber: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 注文種別 that must have a 有効終了日 (no 無期限) — テスト・サンプルは一時価格な
 * ので終了日を必須にする。本番・その他は無期限可。
 */
export const END_DATE_REQUIRED_TYPES = ["TEST", "SAMPLE"];

export function requiresEndDate(orderType: string): boolean {
  return END_DATE_REQUIRED_TYPES.includes(orderType);
}

export type EntryOrderType = "PRODUCTION" | "TEST" | "SAMPLE" | "OTHER";

/** Bare entry identity（顧客×製品×種別）— duplicate warnings 用。 */
export interface EntryIdentity {
  customerBpId: string;
  productId: string;
  orderType: string;
}

/**
 * Tier の採用単価 — 手動上書きがあればそれ、なければ 基準単価 × 倍率（円丸め）。
 */
export function tierUnitPrice(e: PriceListEntry, t: PriceTier): number {
  return t.priceOverride ?? Math.round(e.baseUnitPrice * t.multiplier);
}

/** "×1.05" — 倍率表示. */
export function multiplierLabel(t: PriceTier): string {
  return `×${t.multiplier.toFixed(2)}`;
}

/** List-row / summary aggregates derived from an entry's tiers. */
export interface EntrySummary {
  tierCount: number;
  minPrice: number;
  maxPrice: number;
}

export function entrySummary(e: PriceListEntry): EntrySummary {
  const prices = e.tiers.map((t) => tierUnitPrice(e, t));
  return {
    tierCount: e.tiers.length,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
}

/** "1〜99本" / "100本〜" (no upper bound). */
export function quantityRange(min: number, max: number | null): string {
  return max == null ? `${min}本〜` : `${min}〜${max}本`;
}

/** "¥4,500〜¥5,000" (single value when min === max). */
export function priceRangeLabel(min: number, max: number): string {
  return min === max
    ? formatMoney(min)
    : `${formatMoney(min)}〜${formatMoney(max)}`;
}

/** "2026/01/01 〜 無期限" */
export function validPeriod(from: string, until: string | null): string {
  return `${formatDate(from)} 〜 ${until ? formatDate(until) : "無期限"}`;
}

// ── 値引きルール解決 ──────────────────────────────────────────────────────────

/** "5%" / "¥100/本" — 値引きルールの値表示. */
export function discountValueLabel(d: PriceDiscount): string {
  return d.discountType === "RATE"
    ? `${d.value}%`
    : `${formatMoney(d.value)}/本`;
}

/** 1本あたりの値引き額（RATE は単価に対する率、10円未満は四捨五入）. */
export function unitDiscountOf(
  d: PriceDiscount,
  baseUnitPrice: number,
): number {
  return d.discountType === "RATE"
    ? Math.round((baseUnitPrice * d.value) / 100)
    : d.value;
}

/**
 * 数量・日付条件を満たす有効な値引きルールを返す。複数該当する場合は
 * 1本あたりの値引き額が最大のものを採用する。
 */
export function findApplicableDiscount(
  entry: PriceListEntry,
  quantity: number,
  baseUnitPrice: number,
  date: Date = new Date(),
): PriceDiscount | null {
  const iso = date.toISOString().slice(0, 10);
  const candidates = entry.discounts.filter(
    (d) =>
      d.isActive &&
      quantity >= d.minQuantity &&
      (d.maxQuantity == null || quantity <= d.maxQuantity) &&
      iso >= d.validFrom &&
      (d.validUntil == null || iso <= d.validUntil),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, d) =>
    unitDiscountOf(d, baseUnitPrice) > unitDiscountOf(best, baseUnitPrice)
      ? d
      : best,
  );
}

/** Other 注文種別 registered for the same (顧客, 製品) — pure over a list. */
export function siblingOrderTypes(
  entry: PriceListEntry,
  entries: PriceListEntry[],
): string[] {
  return entries
    .filter(
      (e) =>
        e.customerId === entry.customerId &&
        e.productId === entry.productId &&
        e.entryId !== entry.entryId,
    )
    .map((e) => e.orderType);
}

/** Existing entries for a (顧客, 製品) — duplicate warnings (pure over a list). */
export function findEntriesByCustomerProduct(
  customerId: string | null | undefined,
  productId: string | null | undefined,
  entries: PriceListEntry[],
): PriceListEntry[] {
  if (!(customerId && productId)) return [];
  return entries.filter(
    (e) => e.customerId === customerId && e.productId === productId,
  );
}
