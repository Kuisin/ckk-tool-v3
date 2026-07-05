/**
 * mock.ts — 見積書 (quote) demo data + price-list resolution.
 *
 * Model (per _specs/tables.md `quotes` / `quote_items`):
 *   Quote = (顧客, 支店?, 状態, 有効期限) + a list of items.
 *     └ Item = (製品, 注文種別, 数量) → 単価 AND 値引き are resolved from the
 *               価格表 (tiers + 値引きルール) for that (顧客 × 製品 × 注文種別 ×
 *               数量 × 日付), then 金額 = 単価 × 数量 − 値引き.
 *
 * 見積書 is a print document — it never carries manual prices; everything is
 * derived from 価格表 data. `resolveUnitPrice` is the link — it reads
 * MOCK_PRICE_ENTRIES tiers + discounts so a quote literally displays 価格表
 * data. Swap arrays/helpers for Prisma later.
 */

import {
  discountValueLabel,
  entryKey,
  findApplicableDiscount,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  type PriceTier,
  tierUnitPrice,
  unitDiscountOf,
} from "@/components/sales/price-lists/mock";
import type { PdfFileMeta } from "@/components/ui/PdfAttachmentPanel";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";

/**
 * A resolved 価格表 price: base 単価 (tier) + auto-applied 値引きルール.
 * `discountAmount` is the LINE total (1本あたり値引き × 数量).
 */
export interface ResolvedPrice {
  unitPrice: number;
  tierId: string | null;
  tierLabel: string | null;
  discountAmount: number;
  discountId: string | null;
  /** e.g. "夏季キャンペーン（5%）" — null when no rule applies. */
  discountLabel: string | null;
}

/**
 * Resolve 単価 + 値引き from the 価格表 for (顧客 × 製品 × 注文種別 × 数量).
 * The discount rule list is evaluated against `date` (default: today).
 * Returns null when no entry/tier matches — the line cannot be quoted.
 */
export function resolveUnitPrice(
  customerId: string,
  productId: string,
  orderType: string,
  quantity: number,
  date: Date = new Date(),
): ResolvedPrice | null {
  const entry = getPriceEntry(entryKey(customerId, productId, orderType));
  if (!entry) return null;
  const tier = entry.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  if (!tier) return null;
  // 単価 = 基準単価 × 数量倍率（tier の手動上書きがあればそれ）。
  const unitPrice = tierUnitPrice(entry, tier);
  const discount = findApplicableDiscount(entry, quantity, unitPrice, date);
  return {
    unitPrice,
    tierId: tier.id,
    tierLabel: tierLabel(tier),
    discountAmount: discount
      ? unitDiscountOf(discount, unitPrice) * quantity
      : 0,
    discountId: discount?.id ?? null,
    discountLabel: discount
      ? `${discount.label}（${discountValueLabel(discount)}）`
      : null,
  };
}

/** "1〜9本" / "100本〜" for a tier (mirrors price-list quantityRange). */
export function tierLabel(t: PriceTier): string {
  return t.maxQuantity == null
    ? `${t.minQuantity}本〜`
    : `${t.minQuantity}〜${t.maxQuantity}本`;
}

/** One quote line — 単価・値引きとも価格表から自動解決（手入力なし）。 */
export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  orderType: string;
  quantity: number;
  unitPrice: number;
  /** 自動解決元の price_list_tier（価格表なしの旧データのみ null）。 */
  priceTierId: string | null;
  /** 値引きルールから自動計算された明細値引き額。 */
  discountAmount: number;
  /** 適用された値引きルール名（なければ null）。 */
  discountLabel: string | null;
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
 * Build a quote item — 単価・値引きとも 価格表 (tiers + 値引きルール) から
 * 自動解決する。手動の価格・値引き入力は存在しない（見積書は印刷用）。
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
    notes?: string | null;
  } = {},
): QuoteItem {
  const resolved = resolveUnitPrice(customerId, productId, orderType, quantity);
  const unitPrice = resolved?.unitPrice ?? 0;
  const discountAmount = resolved?.discountAmount ?? 0;
  return {
    id,
    productId,
    productName,
    orderType,
    quantity,
    unitPrice,
    priceTierId: resolved?.tierId ?? null,
    discountAmount,
    discountLabel: resolved?.discountLabel ?? null,
    amount: Math.max(0, unitPrice * quantity - discountAmount),
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
        // 80本 ≥ 50本 → 値引きルール「数量増値引き」が自動適用される。
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
        label: `${tierLabel(tier)} ${formatMoney(tierUnitPrice(entry, tier))}`,
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
