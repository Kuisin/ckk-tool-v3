/**
 * mock.ts — Price-list demo data + display helpers.
 *
 * Model (per _specs/tables.md `price_list_entries`):
 *   Entry = (顧客, 製品, 注文種別) — the identity key (unique, immutable).
 *           Owns the 有効期間 (validFrom/validUntil) + 通貨 + 状態.
 *     └ Tier = (数量範囲 → 単価)   ← all tiers of an entry share its period.
 *
 * The entry is the editable unit and the list row: one (顧客, 製品, 注文種別) per
 * row / per page. 本番・テスト など注文種別ごとにページ・行を分ける。
 * Swap arrays/helpers for Prisma later — components depend only on these shapes.
 */

import { formatDate, formatMoney } from "@/lib/format";

/** One quantity tier: 数量範囲 → 単価. */
export interface PriceTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
}

/** A (顧客, 製品, 注文種別) price entry — owns the period shared by its tiers. */
export interface PriceListEntry {
  entryId: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  orderType: string;
  currency: string;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  tiers: PriceTier[];
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

/** URL-safe entry key — `{customerId}__{productId}__{orderType}`. */
export function entryKey(
  customerId: string,
  productId: string,
  orderType: string,
): string {
  return `${customerId}__${productId}__${orderType}`;
}

export const MOCK_PRICE_ENTRIES: PriceListEntry[] = [
  {
    entryId: entryKey("bp-001", "PRD-202601-0001", "PRODUCTION"),
    customerId: "bp-001",
    customerName: "株式会社ABC製作所",
    productId: "PRD-202601-0001",
    productName: "精密軸 PRD-202601-0001",
    orderType: "PRODUCTION",
    currency: "JPY",
    validFrom: "2026-01-01",
    validUntil: null,
    isActive: true,
    tiers: [
      { id: "ti-1", minQuantity: 1, maxQuantity: 99, unitPrice: 5000 },
      { id: "ti-2", minQuantity: 100, maxQuantity: null, unitPrice: 4500 },
    ],
    createdBy: "鈴木 一郎",
    createdAt: "2025-12-20 09:15",
    updatedAt: "2026-01-05 14:30",
  },
  {
    entryId: entryKey("bp-001", "PRD-202601-0001", "SAMPLE"),
    customerId: "bp-001",
    customerName: "株式会社ABC製作所",
    productId: "PRD-202601-0001",
    productName: "精密軸 PRD-202601-0001",
    orderType: "SAMPLE",
    currency: "JPY",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    isActive: true,
    tiers: [{ id: "ti-3", minQuantity: 1, maxQuantity: null, unitPrice: 0 }],
    createdBy: "鈴木 一郎",
    createdAt: "2025-12-20 09:15",
    updatedAt: "2026-01-05 14:30",
  },
  {
    entryId: entryKey("bp-002", "PRD-202602-0008", "PRODUCTION"),
    customerId: "bp-002",
    customerName: "合同会社XYZ工業",
    productId: "PRD-202602-0008",
    productName: "ロッド PRD-202602-0008",
    orderType: "PRODUCTION",
    currency: "JPY",
    validFrom: "2026-04-01",
    validUntil: "2026-09-30",
    isActive: true,
    tiers: [{ id: "ti-4", minQuantity: 1, maxQuantity: null, unitPrice: 6200 }],
    createdBy: "田中 太郎",
    createdAt: "2026-03-15 10:00",
    updatedAt: "2026-03-15 10:00",
  },
  {
    entryId: entryKey("bp-003", "PRD-202603-0012", "TEST"),
    customerId: "bp-003",
    customerName: "株式会社DEFエンジニアリング",
    productId: "PRD-202603-0012",
    productName: "特殊加工品 PRD-202603-0012",
    orderType: "TEST",
    currency: "JPY",
    validFrom: "2026-05-01",
    validUntil: "2026-07-31",
    isActive: false,
    tiers: [{ id: "ti-5", minQuantity: 1, maxQuantity: 10, unitPrice: 9500 }],
    createdBy: "中村 花子",
    createdAt: "2026-04-28 16:45",
    updatedAt: "2026-04-30 11:20",
  },
];

export function getPriceEntry(
  entryId: string,
  entries = MOCK_PRICE_ENTRIES,
): PriceListEntry | undefined {
  return entries.find((e) => e.entryId === entryId);
}

/** Other 注文種別 already registered for the same (顧客, 製品). */
export function siblingOrderTypes(
  entry: PriceListEntry,
  entries = MOCK_PRICE_ENTRIES,
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

/** Existing price-list entries for a (顧客, 製品) — used to warn on duplicates. */
export function findEntriesByCustomerProduct(
  customerId: string | null | undefined,
  productId: string | null | undefined,
  entries = MOCK_PRICE_ENTRIES,
): PriceListEntry[] {
  if (!(customerId && productId)) return [];
  return entries.filter(
    (e) => e.customerId === customerId && e.productId === productId,
  );
}

/** List-row / summary aggregates derived from an entry's tiers. */
export interface EntrySummary {
  tierCount: number;
  minPrice: number;
  maxPrice: number;
}

export function entrySummary(e: PriceListEntry): EntrySummary {
  const prices = e.tiers.map((t) => t.unitPrice);
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
