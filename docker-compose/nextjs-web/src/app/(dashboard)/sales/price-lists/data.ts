/**
 * data.ts — server-side fetch/mapping for the 価格表 pages.
 *
 * sales.price_list_entries is keyed (year_month, seq) — the URL id is the
 * derived 価格表番号 PRC-YYYYMM-NNNNN (lib/doc-number). 自然キー
 * (customer_bp_id, product_id, order_type) は UNIQUE の識別用。
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

const ENTRY_INCLUDE = {
  customerBp: true,
  product: true,
  tiers: {
    orderBy: [{ sortOrder: "asc" as const }, { minQuantity: "asc" as const }],
  },
  discounts: { orderBy: { createdAt: "asc" as const } },
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
  const estimateNumber =
    r.estimateYearMonth && r.estimateSeq != null
      ? formatEstimateNumber({
          yearMonth: r.estimateYearMonth,
          seq: r.estimateSeq,
        })
      : null;
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
    orderType: r.orderType,
    currency: r.currency,
    baseUnitPrice: Number(r.baseUnitPrice),
    validFrom: iso(r.validFrom),
    validUntil: r.validUntil ? iso(r.validUntil) : null,
    isActive: r.isActive,
    tiers: r.tiers.map((t) => ({
      id: t.id,
      minQuantity: t.minQuantity,
      maxQuantity: t.maxQuantity,
      multiplier: Number(t.multiplier),
      priceOverride: t.priceOverride != null ? Number(t.priceOverride) : null,
    })),
    discounts: r.discounts.map((d) => ({
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
      priceListTier: { entryYearMonth: key.yearMonth, entrySeq: key.seq },
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
