/**
 * mock.ts — 見積書 demo quotes (test fixtures).
 *
 * Formerly the screen mock; the quote screens now read sales.quotes via
 * Prisma (see app/sales/quotes/data.ts and ./model.ts for the shared
 * types/helpers). Kept ONLY as deterministic fixtures for the pricing unit
 * tests — the mock-bound `resolveUnitPrice` resolves against the 価格表
 * fixtures (../price-lists/mock).
 */

import { MOCK_PRICE_ENTRIES } from "../price-lists/mock";
import {
  findPriceTierRefIn,
  type PriceTierRef,
  priceEntriesForQuoteIn,
  type Quote,
  type QuoteItem,
  type ResolvedPrice,
  resolveUnitPriceFromEntries,
} from "./model";

export * from "./model";

/** Fixture-bound resolver — 価格表 fixtures + (顧客 × 製品 × 種別 × 数量). */
export function resolveUnitPrice(
  customerId: string,
  productId: string,
  orderType: string,
  quantity: number,
  date: Date = new Date(),
): ResolvedPrice | null {
  return resolveUnitPriceFromEntries(
    MOCK_PRICE_ENTRIES,
    customerId,
    productId,
    orderType,
    quantity,
    date,
  );
}

export function findPriceTierRef(
  priceTierId: string | null,
): PriceTierRef | null {
  return findPriceTierRefIn(MOCK_PRICE_ENTRIES, priceTierId);
}

export function priceEntriesForQuote(q: Quote) {
  return priceEntriesForQuoteIn(MOCK_PRICE_ENTRIES, q);
}

/**
 * Build a quote item — 単価・値引きとも 価格表 fixtures から自動解決する。
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
      "1001",
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
      "1001",
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
      "1001",
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
      "1001",
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
      "1001",
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
      "2008",
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
      "2008",
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
