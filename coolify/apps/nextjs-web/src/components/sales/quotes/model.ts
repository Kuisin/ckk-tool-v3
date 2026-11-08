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
import { type TaxBucket, totalsByRateYen } from "@/lib/money";
import type { PriceMissReason } from "@/lib/order-acceptance-price-core";
import { taxRateFor } from "@/lib/tax-rate";

export type { PriceMissReason };

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
 * 価格表の解決結果 — 引けたら価格、引けなければ**理由**。
 *
 * 理由を返すのは、注文請書の照合が「価格表なし」と「価格表はあるが数量段階が
 * 無い」を区別するため（lib/order-acceptance-price-core の PriceMissReason）。
 * 見積書はどの理由でも行を拒むが、利用者には具体的な理由を出す。
 */
export type PriceResolution =
  | { ok: true; price: ResolvedPrice }
  | { ok: false; reason: PriceMissReason };

/**
 * Resolve 単価 + 値引き from the 価格表 for (顧客 × 製品 × 注文種別 × 数量 ×
 * 日付), pure over `entries`. Entry は顧客×製品で一意、注文種別はその中の
 * variant を選ぶ。製品は**品目 id**（items.id）で指す — 価格表の行も書類の行も
 * 同じ id 空間なので、突き合わせは 1 本のままでよい（品目統合 第 2 段 C）。
 *
 * **価格を出せるのは、有効なエントリの有効なバリアントで、`date`（JST の暦日）
 * が有効期間に入っているものだけ。** 無効化された価格表・期限切れ / 開始前の
 * バリアントは価格を返さない — 以前はここを見ておらず、終了日を過ぎたテスト
 * 価格が見積書・注文請書にそのまま載っていた。
 */
export function resolvePriceFromEntries(
  entries: PriceListEntry[],
  customerId: string,
  itemId: string,
  orderType: string,
  quantity: number,
  tr: Tr,
  date: Date = new Date(),
  /**
   * 品目の**標準価格**（定価。items.standard_unit_price）。顧客の価格表が
   * 当たらないときの拠り所で、価格表があればそちらが勝つ — S/4HANA の
   * 「定価 + 顧客ごとの条件レコード」と同じ順。
   *
   * 渡すかどうかは呼び出し側が決める（lib/standard-price.ts）。いま渡るのは
   * **再研磨の品目だけ** — 製品は価格表が無ければ単価を解決できないままにする。
   */
  standardUnitPrice: number | null = null,
): PriceResolution {
  /**
   * 顧客の価格表が当たらなかったときの答え。
   *
   * **「当たる価格表が無い」ときだけ標準価格へ落ちる**（エントリが無い /
   * 無効化されている / 期間外）。`no-tier` は落とさない — 価格表は現に効いて
   * いて、その数量の段だけが抜けている状態なので、定価で埋めると設定の穴が
   * 見えなくなる。
   */
  const fallback = (reason: PriceMissReason): PriceResolution => {
    if (standardUnitPrice == null || reason === "no-tier") {
      return { ok: false, reason };
    }
    return {
      ok: true,
      price: {
        unitPrice: standardUnitPrice,
        tierId: null,
        tierLabel: tr("sales.priceLists.standardPriceLabel"),
        discountAmount: 0,
        discountId: null,
        discountLabel: null,
      },
    };
  };

  const entry = entries.find(
    (e) => e.customerId === customerId && e.itemId === itemId,
  );
  if (!entry) return fallback("no-entry");
  if (!entry.isActive) return fallback("inactive");
  const variant = entry.variants.find((v) => v.orderType === orderType);
  if (!variant) return fallback("no-entry");
  if (!variant.isActive) return fallback("inactive");
  if (
    !isWithinValidity(isoDateJst(date), variant.validFrom, variant.validUntil)
  )
    return fallback("expired");
  const tier = variant.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  if (!tier) return fallback("no-tier");
  // 単価 = 基準単価 × 数量倍率（tier の手動上書きがあればそれ）。
  const unitPrice = tierUnitPrice(variant, tier);
  const discount = findApplicableDiscount(variant, quantity, unitPrice, date);
  // 値引きは明細金額を超えない（金額が負になる値引きは値引きではない）。
  const lineTotal = unitPrice * quantity;
  const discountAmount = discount
    ? Math.min(unitDiscountOf(discount, unitPrice) * quantity, lineTotal)
    : 0;
  return {
    ok: true,
    price: {
      unitPrice,
      tierId: tier.id,
      tierLabel: tierLabel(tier, tr),
      discountAmount,
      discountId: discount?.id ?? null,
      discountLabel: discount
        ? `${discount.label}（${discountValueLabel(discount, tr)}）`
        : null,
    },
  };
}

/**
 * `resolvePriceFromEntries` の価格だけ版 — 引けなければ null。
 * 理由が要らない呼び出し側（フォームのライブ表示など）はこちら。
 */
export function resolveUnitPriceFromEntries(
  entries: PriceListEntry[],
  customerId: string,
  itemId: string,
  orderType: string,
  quantity: number,
  tr: Tr,
  date: Date = new Date(),
  standardUnitPrice: number | null = null,
): ResolvedPrice | null {
  const r = resolvePriceFromEntries(
    entries,
    customerId,
    itemId,
    orderType,
    quantity,
    tr,
    date,
    standardUnitPrice,
  );
  return r.ok ? r.price : null;
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
  /** 製品 — 値は品目 id（items.id）。品目統合 第 2 段 C。 */
  itemId: string;
  /**
   * 製品コード（`items.code` = `PRD-YYYYMM-NNNN`）。**PDF の「コード」欄に
   * 刷る値**（見積書テンプレートの `code`）。採番前のレガシー品目は null で、
   * そのときは欄を空で刷る — 以前ここには内部の連番 id が入っていた。
   * 判定・突合には使わない（すべて `itemId`）。
   */
  productCode: string | null;
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
  /**
   * その行に当たった税率（0.1 = 10%）。保存時のスナップショット。
   * 旧データ（税区分マスタ以前の見積）は null で、その場合だけ顧客の課税区分から
   * 起こす（`quoteTotals`）。
   */
  taxRate: number | null;
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
  /**
   * 顧客の課税区分（bp_customer_attrs.tax_type: TAXABLE / REDUCED / EXEMPT）。
   * 消費税の計算に使う（lib/tax-rate.ts）。属性が無ければ null = 課税扱い。
   */
  customerTaxType: string | null;
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
 *
 * `today` は **JST の暦日**（`isoDateJst`）。`toISOString()` の UTC 日付だと
 * JST 0:00〜8:59 が前日扱いになり、有効期限当日の翌朝までまだ「有効」に見える。
 */
export function quoteDisplayStatus(
  q: Pick<Quote, "status" | "validUntil">,
  today: string = isoDateJst(new Date()),
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

/** 小計 / 消費税 / 合計(税込) — design-preview quote.html の totals に対応。 */
export interface QuoteTotals {
  subtotal: number;
  tax: number;
  grandTotal: number;
  /** 税率ごとの区分記載。率の降順・0% の束も落とさない（請求書と同じ形）。 */
  buckets: TaxBucket[];
}

/**
 * 消費税は**明細ごとの税率**で決まる（製品ごとに課税区分が違い得る）。率は保存時に
 * 行へ凍結してあるので、発行後に税率マスタが変わっても見積書は動かない。
 *
 * 税区分マスタ以前の見積（`taxRate` が null）は顧客の課税区分から起こす — そうすると
 * 移行の前後で古い見積の金額が変わらない（請求書の `resolveTaxBuckets` と同じ考え方）。
 *
 * 明細の金額（amount）は保存時のスナップショットのまま — ここで再計算しない。
 */
export function quoteTotals(
  q: Pick<Quote, "items" | "customerTaxType">,
): QuoteTotals {
  const fallbackRate = taxRateFor(q.customerTaxType);
  const { subtotal, taxAmount, totalAmount, buckets } = totalsByRateYen(
    q.items.map((it) => ({
      amount: it.amount,
      taxRate: it.taxRate ?? fallbackRate,
    })),
  );
  return { subtotal, tax: taxAmount, grandTotal: totalAmount, buckets };
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
