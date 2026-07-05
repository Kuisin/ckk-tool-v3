/**
 * mock.ts — 見積書 (quote) demo data + price-list resolution.
 *
 * Model (per _specs/tables.md `quotes` / `quote_items`):
 *   Quote = (顧客, 支店?, 状態, 有効期限) + a list of items.
 *     └ Item = (製品, 注文種別, 数量) → 単価 is resolved from the 価格表
 *               (price_list_tiers) for that (顧客 × 製品 × 注文種別 × 数量),
 *               then 金額 = 単価 × 数量 − 値引き.
 *
 * The defining feature (see 見積書-1.pdf): one product quoted across several
 * 数量 tiers, each row carrying the 価格表 unit price for that quantity band.
 * `resolveUnitPrice` is the link — it reads MOCK_PRICE_ENTRIES tiers so a quote
 * literally displays 価格表 data. Swap arrays/helpers for Prisma later.
 */

import {
  entryKey,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  type PriceTier,
} from "@/components/sales/price-lists/mock";
import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";

/** A resolved 単価 + the 価格表 tier it came from (null = manual override). */
export interface ResolvedPrice {
  unitPrice: number;
  tierId: string | null;
  tierLabel: string | null;
}

/**
 * Resolve the 価格表 単価 for (顧客 × 製品 × 注文種別 × 数量).
 * Returns the matching tier's unit price, or null when no entry/tier matches.
 */
export function resolveUnitPrice(
  customerId: string,
  productId: string,
  orderType: string,
  quantity: number,
): ResolvedPrice | null {
  const entry = getPriceEntry(entryKey(customerId, productId, orderType));
  if (!entry) return null;
  const tier = entry.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  if (!tier) return null;
  return {
    unitPrice: tier.unitPrice,
    tierId: tier.id,
    tierLabel: tierLabel(tier),
  };
}

/** "1〜9本" / "100本〜" for a tier (mirrors price-list quantityRange). */
export function tierLabel(t: PriceTier): string {
  return t.maxQuantity == null
    ? `${t.minQuantity}本〜`
    : `${t.minQuantity}〜${t.maxQuantity}本`;
}

/** One quote line — 価格表 から解決された単価で構成。 */
export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number;
  /** 自動解決元の price_list_tier（手動入力時は null）。 */
  priceTierId: string | null;
  discountAmount: number;
  /** unit_price × quantity − discount_amount. */
  amount: number;
  deliveryDate: string | null;
  notes: string | null;
}

export type QuoteStatus =
  | "DRAFT"
  | "ISSUED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED";

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  customerBranchId: string | null;
  customerBranchName: string | null;
  status: QuoteStatus;
  validUntil: string | null;
  notes: string | null;
  items: QuoteItem[];
  /**
   * 発行時に保存された PDF（quotes.pdf_file_id → files）。DRAFT の間は null。
   * 実データは /api/pdf/quote が SeaweedFS に保存・配信する。
   */
  pdfFile: PdfFileMeta | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build a quote item, resolving 単価 from the 価格表 unless overridden.
 * `unitPriceOverride` mirrors a manual 単価 entry (priceTierId stays null).
 */
function buildItem(
  id: string,
  customerId: string,
  productId: string,
  productName: string,
  orderType: string,
  quantity: number,
  opts: {
    deliveryDate?: string | null;
    discountAmount?: number;
    notes?: string | null;
    unitPriceOverride?: number;
  } = {},
): QuoteItem {
  const resolved = resolveUnitPrice(customerId, productId, orderType, quantity);
  const unitPrice = opts.unitPriceOverride ?? resolved?.unitPrice ?? 0;
  const discountAmount = opts.discountAmount ?? 0;
  return {
    id,
    productId,
    productName,
    orderType,
    quantity,
    unitPrice,
    priceTierId:
      opts.unitPriceOverride != null ? null : (resolved?.tierId ?? null),
    discountAmount,
    amount: unitPrice * quantity - discountAmount,
    deliveryDate: opts.deliveryDate ?? null,
    notes: opts.notes ?? null,
  };
}

/**
 * 価格表連動の見積書（サンプル準拠）。同一製品を複数の数量段階で見積もり、
 * 各行の単価は (顧客 × 製品 × 注文種別 × 数量) の価格表 tier から解決される。
 */
const TIERED_QUOTE: Quote = {
  id: "QOT-202602-00012",
  quoteNumber: "QOT-202602-00012",
  customerId: "bp-001",
  customerName: "株式会社ABC製作所",
  customerBranchId: "bp-001-t",
  customerBranchName: "東京本社",
  status: "ISSUED",
  validUntil: "2026-05-16",
  notes:
    "・本見積は価格表（数量段階単価）に基づきます。\n・2万円以下のご発注の場合は別途送料を頂きます。",
  items: [
    buildItem(
      "qi-1",
      "bp-001",
      "PRD-202601-0001",
      "精密軸 PRD-202601-0001",
      "PRODUCTION",
      2,
      {
        deliveryDate: "2026-04-15",
      },
    ),
    buildItem(
      "qi-2",
      "bp-001",
      "PRD-202601-0001",
      "精密軸 PRD-202601-0001",
      "PRODUCTION",
      10,
      {
        deliveryDate: "2026-04-15",
      },
    ),
    buildItem(
      "qi-3",
      "bp-001",
      "PRD-202601-0001",
      "精密軸 PRD-202601-0001",
      "PRODUCTION",
      30,
      {
        deliveryDate: "2026-04-15",
      },
    ),
    buildItem(
      "qi-4",
      "bp-001",
      "PRD-202601-0001",
      "精密軸 PRD-202601-0001",
      "PRODUCTION",
      50,
      {
        deliveryDate: "2026-04-15",
      },
    ),
    buildItem(
      "qi-5",
      "bp-001",
      "PRD-202601-0001",
      "精密軸 PRD-202601-0001",
      "PRODUCTION",
      100,
      {
        deliveryDate: "2026-04-22",
      },
    ),
  ],
  pdfFile: {
    filename: "QOT-202602-00012.pdf",
    sizeBytes: 182_400,
    generatedAt: "2026-02-16 10:05",
    generatedBy: "鈴木 一郎",
  },
  createdBy: "鈴木 一郎",
  createdAt: "2026-02-16 09:30",
  updatedAt: "2026-02-16 10:05",
};

const SINGLE_QUOTE: Quote = {
  id: "QOT-202603-00021",
  quoteNumber: "QOT-202603-00021",
  customerId: "bp-002",
  customerName: "合同会社XYZ工業",
  customerBranchId: null,
  customerBranchName: null,
  status: "DRAFT",
  validUntil: "2026-06-30",
  notes: null,
  items: [
    buildItem(
      "qj-1",
      "bp-002",
      "PRD-202602-0008",
      "ロッド PRD-202602-0008",
      "PRODUCTION",
      20,
      {
        deliveryDate: "2026-05-20",
      },
    ),
    buildItem(
      "qj-2",
      "bp-002",
      "PRD-202602-0008",
      "ロッド PRD-202602-0008",
      "PRODUCTION",
      80,
      {
        deliveryDate: "2026-05-20",
        discountAmount: 5000,
        notes: "数量増による値引き",
      },
    ),
  ],
  pdfFile: null,
  createdBy: "田中 太郎",
  createdAt: "2026-03-02 13:40",
  updatedAt: "2026-03-02 13:40",
};

export const MOCK_QUOTES: Quote[] = [TIERED_QUOTE, SINGLE_QUOTE];

export function getQuote(id: string, quotes = MOCK_QUOTES): Quote | undefined {
  return quotes.find((q) => q.id === id);
}

/** 小計 / 消費税(10%) / 合計(税込) — design-preview quote.html の totals に対応。 */
export interface QuoteTotals {
  subtotal: number;
  tax: number;
  grandTotal: number;
}

export const TAX_RATE = 0.1;

export function quoteTotals(q: Quote): QuoteTotals {
  const subtotal = q.items.reduce((sum, it) => sum + it.amount, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  return { subtotal, tax, grandTotal: subtotal + tax };
}

/** 注文種別ラベル（本番 / テスト …）。 */
export function orderTypeLabel(orderType: string): string {
  return ORDER_TYPE_LABEL[orderType] ?? orderType;
}

/** A stored priceTierId → its 価格表 entry + tier (適用価格表 display). */
export interface PriceTierRef {
  entryId: string;
  estimateNumber: string | null;
  /** e.g. "1〜9本 ¥8,000" */
  label: string;
}

export function findPriceTierRef(
  priceTierId: string | null,
): PriceTierRef | null {
  if (!priceTierId) return null;
  for (const entry of MOCK_PRICE_ENTRIES) {
    const tier = entry.tiers.find((t) => t.id === priceTierId);
    if (tier) {
      return {
        entryId: entry.entryId,
        estimateNumber: entry.estimateNumber,
        label: `${tierLabel(tier)} ${formatMoney(tier.unitPrice)}`,
      };
    }
  }
  return null;
}

/** 価格表 entries referenced by a quote's items (関連 tab). */
export function priceEntriesForQuote(q: Quote) {
  const entryIds = new Set(
    q.items
      .map((it) => findPriceTierRef(it.priceTierId)?.entryId)
      .filter((id): id is string => !!id),
  );
  return MOCK_PRICE_ENTRIES.filter((e) => entryIds.has(e.entryId));
}
