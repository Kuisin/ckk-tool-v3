/**
 * data.ts — server-side fetch/mapping for the 見積書 pages.
 *
 * sales.quotes is keyed (year_month, seq) — QOT-YYYYMM-NNNNN is derived and
 * doubles as the URL id.
 */

import type { PriceListEntry } from "@/components/sales/price-lists/model";
import type { Quote } from "@/components/sales/quotes/model";
import { prisma } from "@/lib/db";
import { type DocKey, formatQuoteNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { mapEntry } from "../price-lists/data";

const QUOTE_INCLUDE = {
  customerBp: true,
  customerBranchBp: true,
  pdfFile: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: true },
  },
};

type QuoteRow = NonNullable<Awaited<ReturnType<typeof findQuoteRow>>>;

function findQuoteRow(key: DocKey) {
  return prisma.quote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: QUOTE_INCLUDE,
  });
}

export function mapQuote(r: QuoteRow): Quote {
  const number = formatQuoteNumber({ yearMonth: r.yearMonth, seq: r.seq });
  return {
    id: number,
    quoteNumber: number,
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    customerBranchId: r.customerBranchBpId,
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    status: r.status,
    validUntil: r.validUntil?.toISOString().slice(0, 10) ?? null,
    notes: r.notes,
    items: r.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: `${localized(it.product.name as LocalizedText | null)} ${it.productId}`,
      orderType: it.orderType,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      priceTierId: it.priceListTierId,
      discountAmount: Number(it.discountAmount),
      discountLabel: it.discountLabel,
      amount: Number(it.amount),
      deliveryDate: it.deliveryDate?.toISOString().slice(0, 10) ?? null,
      notes: it.notes,
    })),
    pdfFile: r.pdfFile
      ? {
          filename: r.pdfFile.filename,
          sizeBytes: Number(r.pdfFile.sizeBytes ?? 0),
          generatedAt: r.pdfFile.createdAt.toISOString(),
          generatedBy: "—",
        }
      : null,
    createdBy: "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function fetchQuotes(): Promise<Quote[]> {
  const rows = await prisma.quote.findMany({
    include: QUOTE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapQuote);
}

export async function fetchQuote(key: DocKey): Promise<Quote | null> {
  const row = await findQuoteRow(key);
  return row ? mapQuote(row) : null;
}

/** 価格表 entries referenced by a quote's item tiers (関連タブ・適用価格表). */
export async function fetchEntriesForQuote(
  key: DocKey,
): Promise<PriceListEntry[]> {
  const tiers = await prisma.priceListTier.findMany({
    where: {
      quoteItems: {
        some: { quoteYearMonth: key.yearMonth, quoteSeq: key.seq },
      },
    },
    select: { customerBpId: true, productId: true, orderType: true },
  });
  const seen = new Set<string>();
  const keys = tiers.filter((t) => {
    const k = `${t.customerBpId}__${t.productId}__${t.orderType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (keys.length === 0) return [];
  const rows = await prisma.priceListEntry.findMany({
    where: { OR: keys },
    include: {
      customerBp: true,
      product: true,
      tiers: {
        orderBy: [
          { sortOrder: "asc" as const },
          { minQuantity: "asc" as const },
        ],
      },
      discounts: { orderBy: { createdAt: "asc" as const } },
    },
  });
  return rows.map(mapEntry);
}

/** 顧客の全価格表エントリ — 見積フォームのライブ価格解決用。 */
export async function fetchEntriesForCustomer(
  customerBpId?: string,
): Promise<PriceListEntry[]> {
  const rows = await prisma.priceListEntry.findMany({
    where: customerBpId ? { customerBpId } : undefined,
    include: {
      customerBp: true,
      product: true,
      tiers: {
        orderBy: [
          { sortOrder: "asc" as const },
          { minQuantity: "asc" as const },
        ],
      },
      discounts: { orderBy: { createdAt: "asc" as const } },
    },
  });
  return rows.map(mapEntry);
}

/** 支店 options per 顧客 — bp.business_partners の親子関係から。 */
export async function fetchBranchesByCustomer(): Promise<
  Record<string, { value: string; label: string }[]>
> {
  const rows = await prisma.businessPartner.findMany({
    where: { isActive: true, parentId: { not: null } },
    orderBy: { bpCode: "asc" },
  });
  const map: Record<string, { value: string; label: string }[]> = {};
  for (const r of rows) {
    if (!r.parentId) continue;
    map[r.parentId] ??= [];
    map[r.parentId].push({
      value: r.id,
      label: localized(r.name as LocalizedText | null),
    });
  }
  return map;
}
