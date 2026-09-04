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
  isoDateJst,
  isWithinValidity,
  type PriceListEntry,
  type PriceTier,
  tierUnitPrice,
  unitDiscountOf,
} from "@/components/sales/price-lists/model";
import { formatMoney } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
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
 * Resolve 単価 + 値引き from the 価格表 for (顧客 × 製品 × 注文種別 × 数量 ×
 * 日付), pure over `entries`. Entry は顧客×製品で一意、注文種別はその中の
 * variant を選ぶ。Returns null when no entry/variant/tier matches — the line
 * cannot be quoted.
 *
 * **価格を出せるのは、有効なエントリの有効なバリアントで、`date`（JST の暦日）
 * が有効期間に入っているものだけ。** 無効化された価格表・期限切れ / 開始前の
 * バリアントは「価格表なし」と同じ扱い（null）— 以前はここを見ておらず、
 * 終了日を過ぎたテスト価格が見積書・注文請書にそのまま載っていた。
 */
export function resolveUnitPriceFromEntries(
  entries: PriceListEntry[],
  customerId: string,
  productId: string,
  orderType: string,
  quantity: number,
  tr: Tr,
  date: Date = new Date(),
): ResolvedPrice | null {
  const entry = entries.find(
    (e) => e.customerId === customerId && e.productId === productId,
  );
  if (!entry?.isActive) return null;
  const variant = entry.variants.find((v) => v.orderType === orderType);
  if (!variant?.isActive) return null;
  if (
    !isWithinValidity(isoDateJst(date), variant.validFrom, variant.validUntil)
  )
    return null;
  const tier = variant.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  if (!tier) return null;
  // 単価 = 基準単価 × 数量倍率（tier の手動上書きがあればそれ）。
  const unitPrice = tierUnitPrice(variant, tier);
  const discount = findApplicableDiscount(variant, quantity, unitPrice, date);
  return {
    unitPrice,
    tierId: tier.id,
    tierLabel: tierLabel(tier, tr),
    discountAmount: discount
      ? unitDiscountOf(discount, unitPrice) * quantity
      : 0,
    discountId: discount?.id ?? null,
    discountLabel: discount
      ? `${discount.label}（${discountValueLabel(discount, tr)}）`
      : null,
  };
}

/** "1〜9本" / "100本〜" for a tier (mirrors price-list quantityRange). */
export function tierLabel(t: PriceTier, tr: Tr): string {
  return t.maxQuantity == null
    ? tr("sales.priceLists.quantityRangeOpen", { min: t.minQuantity })
    : tr("sales.priceLists.quantityRangeBounded", {
        min: t.minQuantity,
        max: t.maxQuantity,
      });
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

/** 保存される状態 — DRAFT / ISSUED の 2 つだけ。 */
export type QuoteStatus = "DRAFT" | "ISSUED";

/** 画面に出す状態 — EXPIRED は保存せず、有効期限からその場で導く。 */
export type QuoteDisplayStatus = QuoteStatus | "EXPIRED";

export interface Quote {
  /** Derived document number QOT-YYYYMM-NNNNN — also the URL id. */
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  customerBranchId: string | null;
  customerBranchName: string | null;
  /**
   * PDF の言語 — 支店の設定があればそれ、無ければ顧客本体の設定、どちらも
   * 未設定なら null（既定言語 ja）。_specs/i18n-glossary.md §2.7・決定 10。
   */
  recipientDocumentLocale: string | null;
  status: QuoteStatus;
  validUntil: string | null;
  notes: string | null;
  items: QuoteItem[];
  /** 営業担当（作成時に顧客の主担当を複写したスナップショット）。 */
  salesRepId: string | null;
  salesRepName: string | null;
  /** 作成者の表示名（未設定・システム作成は "—"）。 */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 画面に出す状態 — 発行済みで有効期限 (validUntil) を過ぎていれば「期限切れ」。
 * 保存しない派生値（`today` は呼び出し側で 1 回だけ computed — KioskCardsTable の
 * `resolveCardValidity` と同じ約束）。
 */
export function quoteDisplayStatus(
  q: Pick<Quote, "status" | "validUntil">,
  today: string = new Date().toISOString().slice(0, 10),
): QuoteDisplayStatus {
  if (q.status === "ISSUED" && q.validUntil && q.validUntil < today) {
    return "EXPIRED";
  }
  return q.status;
}

/** 編集可能か — 下書き（DRAFT）のみ。発行後は複製して作り直す。 */
export function isEditable(q: Pick<Quote, "status">) {
  return q.status === "DRAFT";
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
  tr: Tr,
): PriceTierRef | null {
  if (!priceTierId) return null;
  for (const entry of entries) {
    for (const variant of entry.variants) {
      const tier = variant.tiers.find((t) => t.id === priceTierId);
      if (tier) {
        return {
          entryId: entry.entryId,
          estimateNumber: variant.estimateNumber,
          label: `${tierLabel(tier, tr)} ${formatMoney(tierUnitPrice(variant, tier))}`,
        };
      }
    }
  }
  return null;
}

/** 価格表 entries referenced by a quote's items (関連 tab). */
export function priceEntriesForQuoteIn(
  entries: PriceListEntry[],
  q: Quote,
  tr: Tr,
): PriceListEntry[] {
  const entryIds = new Set(
    q.items
      .map((it) => findPriceTierRefIn(entries, it.priceTierId, tr)?.entryId)
      .filter((id): id is string => !!id),
  );
  return entries.filter((e) => entryIds.has(e.entryId));
}
