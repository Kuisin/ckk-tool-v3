/**
 * mock.ts — Price-list demo data + display helpers.
 *
 * Model (per _specs/tables.md `price_list_entries`):
 *   Entry = (顧客, 製品, 注文種別) — the identity key (unique, immutable).
 *           Owns 基準単価 (試算の見積単価、手動上書き可) + 有効期間 + 通貨 + 状態.
 *     └ Tier     = 数量範囲 → 倍率 (×1.01 など)。単価 = 基準単価 × 倍率、
 *                  行ごとに手動上書き (priceOverride) 可。
 *     └ Discount = 期間 × 数量条件 → 値引きルール（専用リスト）。
 *
 * 価格表は試算からのみ作成する（基準単価は試算値を直接使うか手動上書き）。
 * 見積書は価格表からのみ価格を解決する（単価・値引きとも自動計算）。
 * The entry is the editable unit and the list row: one (顧客, 製品, 注文種別) per
 * row / per page. 本番・テスト など注文種別ごとにページ・行を分ける。
 * Swap arrays/helpers for Prisma later — components depend only on these shapes.
 */

import { formatDate, formatMoney } from "@/lib/format";

/**
 * One quantity tier: 数量範囲 → 倍率。
 * 単価 = round(基準単価 × multiplier)、`priceOverride` で行ごとに手動上書き可。
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
 *
 * 見積書は価格表からのみ価格を解決するため、値引きもここで管理する:
 *   RATE   = 単価に対する率 (%)
 *   AMOUNT = 1本あたりの値引き額 (¥/本)
 * 条件（数量範囲・有効期間）を満たすルールのうち、1本あたりの値引きが最大の
 * ものが適用される。MIGRATION NOTE: `price_list_discounts` table.
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

/** A (顧客, 製品, 注文種別) price entry — owns the period shared by its tiers. */
export interface PriceListEntry {
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
  /** 試算元 trial-estimate id/番号（旧データのみ null）— price_lists.estimate_id. */
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
    baseUnitPrice: 6000, // 試算 EST-202605-00031 の見積単価
    validFrom: "2026-01-01",
    validUntil: null,
    isActive: true,
    tiers: [
      // 単価 = 基準単価 × 倍率（priceOverride で行ごとに手動上書き可）。
      {
        id: "ti-1",
        minQuantity: 1,
        maxQuantity: 9,
        multiplier: 1.35,
        priceOverride: 8000, // 手動上書き（×1.35 → ¥8,100 を丸め）
      },
      {
        id: "ti-2",
        minQuantity: 10,
        maxQuantity: 29,
        multiplier: 1.15,
        priceOverride: null, // → ¥6,900
      },
      {
        id: "ti-3a",
        minQuantity: 30,
        maxQuantity: 99,
        multiplier: 1.05,
        priceOverride: null, // → ¥6,300
      },
      {
        id: "ti-2b",
        minQuantity: 100,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null, // → ¥6,000（基準どおり）
      },
    ],
    discounts: [
      {
        id: "pd-1",
        label: "夏季キャンペーン",
        discountType: "RATE",
        value: 5,
        minQuantity: 100,
        maxQuantity: null,
        validFrom: "2026-06-01",
        validUntil: "2026-08-31",
        isActive: true,
      },
      {
        id: "pd-2",
        label: "初回導入割",
        discountType: "AMOUNT",
        value: 300,
        minQuantity: 10,
        maxQuantity: 99,
        validFrom: "2026-01-01",
        validUntil: "2026-03-31",
        isActive: false,
      },
    ],
    estimateId: "te-0001",
    estimateNumber: "EST-202605-00031",
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
    baseUnitPrice: 0, // サンプルは金額0
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    isActive: true,
    tiers: [
      {
        id: "ti-3",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null,
      },
    ],
    discounts: [],
    estimateId: "te-0001",
    estimateNumber: "EST-202605-00031",
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
    baseUnitPrice: 6200,
    validFrom: "2026-04-01",
    validUntil: "2026-09-30",
    isActive: true,
    tiers: [
      {
        id: "ti-4",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null,
      },
    ],
    discounts: [
      {
        id: "pd-3",
        label: "数量増値引き",
        discountType: "AMOUNT",
        value: 100,
        minQuantity: 50,
        maxQuantity: null,
        validFrom: "2026-04-01",
        validUntil: "2026-09-30",
        isActive: true,
      },
    ],
    estimateId: null,
    estimateNumber: null,
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
    baseUnitPrice: 9500,
    validFrom: "2026-05-01",
    validUntil: "2026-07-31",
    isActive: false,
    tiers: [
      {
        id: "ti-5",
        minQuantity: 1,
        maxQuantity: 10,
        multiplier: 1,
        priceOverride: null,
      },
    ],
    discounts: [],
    estimateId: null,
    estimateNumber: null,
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
