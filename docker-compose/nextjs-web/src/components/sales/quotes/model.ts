/**
 * model.ts — 見積書 view-model types + pure 価格表 resolution helpers.
 *
 * Model (sales.quotes / quote_items — combined key year_month+seq, QOT-
 * number derived):
 *   Quote = (顧客, 支店?, 状態, 有効期限) + a list of items.
 *     └ Item = (製品, 注文種別, 数量) → 単価 AND 値引き are resolved from the
 *               価格表 (tiers + 値引きルール) for that (顧客 × 製品 × 注文種別 ×
 *               数量 × 日付), then 金額 = 単価 × 数量 − 値引き.
 *
 * 見積書 is a print document — it never carries manual prices; everything is
 * derived from 価格表 data. `resolveUnitPriceFromEntries` is the link — pure
 * over a passed entry list so both the client form (live) and the Server
 * Actions (persist-time snapshot) share one implementation.
 */

import {
  discountValueLabel,
  findApplicableDiscount,
  type PriceListEntry,
  type PriceTier,
  tierUnitPrice,
  unitDiscountOf,
} from "@/components/sales/price-lists/model";
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
 * Resolve 単価 + 値引き from the 価格表 for (顧客 × 製品 × 注文種別 × 数量),
 * pure over `entries`. Returns null when no entry/tier matches — the line
 * cannot be quoted.
 */
export function resolveUnitPriceFromEntries(
  entries: PriceListEntry[],
  customerId: string,
  productId: string,
  orderType: string,
  quantity: number,
  date: Date = new Date(),
): ResolvedPrice | null {
  const entry = entries.find(
    (e) =>
      e.customerId === customerId &&
      e.productId === productId &&
      e.orderType === orderType,
  );
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
  /** Derived document number QOT-YYYYMM-NNNNN — also the URL id. */
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

export function findPriceTierRefIn(
  entries: PriceListEntry[],
  priceTierId: string | null,
): PriceTierRef | null {
  if (!priceTierId) return null;
  for (const entry of entries) {
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
export function priceEntriesForQuoteIn(
  entries: PriceListEntry[],
  q: Quote,
): PriceListEntry[] {
  const entryIds = new Set(
    q.items
      .map((it) => findPriceTierRefIn(entries, it.priceTierId)?.entryId)
      .filter((id): id is string => !!id),
  );
  return entries.filter((e) => entryIds.has(e.entryId));
}
