/**
 * data.ts — server-side fetch/mapping for the 価格表 pages.
 *
 * sales.price_list_entries is keyed (year_month, seq) — the URL id is the
 * derived 価格表番号 PRC-YYYYMM-NNNNN (lib/doc-number). 自然キー
 * (customer_bp_id, product_id) は UNIQUE の識別用。注文種別ごとの価格は
 * price_list_variants（基準単価・期間・試算リンク + tiers/discounts）。
 */

import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatEstimateNumber,
  formatPriceListNumber,
  formatProductNumber,
  formatQuoteNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { calcTrialPricing, type TrialInput } from "@/lib/trial-pricing";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";

export const ENTRY_INCLUDE = {
  customerBp: true,
  product: true,
  variants: {
    orderBy: { orderType: "asc" as const },
    include: {
      tiers: {
        orderBy: [
          { sortOrder: "asc" as const },
          { minQuantity: "asc" as const },
        ],
      },
      discounts: { orderBy: { createdAt: "asc" as const } },
    },
  },
};

type EntryRow = NonNullable<Awaited<ReturnType<typeof findEntryRow>>>;

function findEntryRow(key: DocKey) {
  return prisma.priceListEntry.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: ENTRY_INCLUDE,
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function mapEntry(r: EntryRow): PriceListEntry {
  return {
    entryId: formatPriceListNumber({ yearMonth: r.yearMonth, seq: r.seq }),
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    productId: String(r.productId),
    productName: (() => {
      const code = formatProductNumber(r.product.yearMonth, r.product.seq);
      const nm = localized(r.product.name as LocalizedText | null);
      return code ? `${nm} ${code}` : nm;
    })(),
    currency: r.currency,
    isActive: r.isActive,
    variants: r.variants.map((v) => {
      const estimateNumber =
        v.estimateYearMonth && v.estimateSeq != null
          ? formatEstimateNumber({
              yearMonth: v.estimateYearMonth,
              seq: v.estimateSeq,
            })
          : null;
      return {
        id: v.id,
        orderType: v.orderType,
        baseUnitPrice: Number(v.baseUnitPrice),
        validFrom: iso(v.validFrom),
        validUntil: v.validUntil ? iso(v.validUntil) : null,
        isActive: v.isActive,
        tiers: v.tiers.map((t) => ({
          id: t.id,
          minQuantity: t.minQuantity,
          maxQuantity: t.maxQuantity,
          multiplier: Number(t.multiplier),
          priceOverride:
            t.priceOverride != null ? Number(t.priceOverride) : null,
        })),
        discounts: v.discounts.map((d) => ({
          id: d.id,
          label: d.label,
          discountType: d.discountType,
          value: Number(d.value),
          minQuantity: d.minQuantity,
          maxQuantity: d.maxQuantity,
          validFrom: iso(d.validFrom),
          validUntil: d.validUntil ? iso(d.validUntil) : null,
          isActive: d.isActive,
        })),
        estimateId: estimateNumber,
        estimateNumber,
      };
    }),
    createdBy: "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function fetchPriceEntries(): Promise<PriceListEntry[]> {
  const rows = await prisma.priceListEntry.findMany({
    include: ENTRY_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapEntry);
}

export async function fetchPriceEntry(
  key: DocKey,
): Promise<PriceListEntry | null> {
  const row = await findEntryRow(key);
  return row ? mapEntry(row) : null;
}

/** この価格表（の tier）から作成された見積書 — 関連タブ用の集計。 */
export interface RelatedQuoteRow {
  quoteNumber: string;
  quantity: number;
  amount: number;
  status: string;
  createdAt: string;
}

export async function fetchRelatedQuotes(
  key: DocKey,
): Promise<RelatedQuoteRow[]> {
  const items = await prisma.quoteItem.findMany({
    where: {
      priceListTier: {
        variant: { entryYearMonth: key.yearMonth, entrySeq: key.seq },
      },
    },
    include: { quote: true },
  });
  const byQuote = new Map<string, RelatedQuoteRow>();
  for (const it of items) {
    const number = formatQuoteNumber({
      yearMonth: it.quoteYearMonth,
      seq: it.quoteSeq,
    });
    const agg = byQuote.get(number) ?? {
      quoteNumber: number,
      quantity: 0,
      amount: 0,
      status: it.quote.status,
      createdAt: it.quote.createdAt.toISOString(),
    };
    agg.quantity += it.quantity;
    agg.amount += Number(it.amount);
    byQuote.set(number, agg);
  }
  return [...byQuote.values()];
}

// ── 試算ソース（価格表作成時の基準単価候補） ─────────────────────────────────

/** 製品にリンクされた確定済み試算 — 基準単価ソースの選択肢。 */
export interface EstimateSource {
  /** 文書番号 EST-YYYYMM-NNNNN（URL id と同一）。 */
  number: string;
  name: string;
  customerName: string | null;
  /** 試算の見積単価（最小ロットの estimateUnitPrice）。 */
  unitPrice: number;
  updatedAt: string;
}

/** result スナップショット（無ければ input から再計算）→ 見積単価。 */
function estimateUnitPriceOf(
  result: unknown,
  input: TrialInput,
  settings: Awaited<ReturnType<typeof getTrialPricingSettings>>,
): number {
  const lots =
    result && typeof result === "object"
      ? (result as { lots?: { estimateUnitPrice?: number }[] }).lots
      : undefined;
  const snap = lots?.[0]?.estimateUnitPrice;
  if (typeof snap === "number") return snap;
  return (
    calcTrialPricing(input, toTrialPricingOptions(settings)).lots[0]
      ?.estimateUnitPrice ?? 0
  );
}

/**
 * 製品にリンクされた CONFIRMED の試算（価格ソース候補）。REGISTERED も含める
 * （既に他の価格表で使用済みでも、同じ試算を別顧客のソースにできる）。
 */
export async function fetchEstimateSourcesForProduct(
  productId: number,
): Promise<EstimateSource[]> {
  const [settings, rows] = await Promise.all([
    getTrialPricingSettings(),
    prisma.estimate.findMany({
      where: { productId, status: { in: ["CONFIRMED", "REGISTERED"] } },
      include: { customerBp: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return rows.map((r) => ({
    number: formatEstimateNumber({ yearMonth: r.yearMonth, seq: r.seq }),
    name: r.name,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    unitPrice: estimateUnitPriceOf(
      r.result,
      r.input as unknown as TrialInput,
      settings,
    ),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
