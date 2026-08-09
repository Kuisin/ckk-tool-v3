/**
 * mock.ts — 価格表 demo entries (test fixtures).
 *
 * Formerly the screen mock; the 価格表 screens now read
 * sales.price_list_entries via Prisma (see app/sales/price-lists/data.ts and
 * ./model.ts for the shared types/helpers). Kept ONLY as deterministic
 * fixtures for the pricing unit tests (and the quotes mock until that screen
 * is wired).
 */

import type { PriceListEntry } from "./model";

export * from "./model";

export const MOCK_PRICE_ENTRIES: PriceListEntry[] = [
  {
    // 顧客×製品で 1 エントリ — 本番とサンプルは同一エントリ内のバリアント。
    entryId: "PRC-202601-00001",
    customerId: "bp-001",
    customerName: "株式会社ABC製作所",
    productId: "1001",
    productName: "精密軸 PRD-202601-0001",
    currency: "JPY",
    isActive: true,
    variants: [
      {
        id: "va-1",
        orderType: "PRODUCTION",
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
        estimateId: "EST-202605-00031",
        estimateNumber: "EST-202605-00031",
      },
      {
        id: "va-2",
        orderType: "SAMPLE",
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
        estimateId: "EST-202605-00031",
        estimateNumber: "EST-202605-00031",
      },
    ],
    createdBy: "鈴木 一郎",
    createdAt: "2025-12-20 09:15",
    updatedAt: "2026-01-05 14:30",
  },
  {
    entryId: "PRC-202602-00003",
    customerId: "bp-002",
    customerName: "合同会社XYZ工業",
    productId: "2008",
    productName: "ロッド PRD-202602-0008",
    currency: "JPY",
    isActive: true,
    variants: [
      {
        id: "va-3",
        orderType: "PRODUCTION",
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
      },
    ],
    createdBy: "田中 太郎",
    createdAt: "2026-03-15 10:00",
    updatedAt: "2026-03-15 10:00",
  },
  {
    entryId: "PRC-202603-00004",
    customerId: "bp-003",
    customerName: "株式会社DEFエンジニアリング",
    productId: "3012",
    productName: "特殊加工品 PRD-202603-0012",
    currency: "JPY",
    isActive: false,
    variants: [
      {
        id: "va-4",
        orderType: "TEST",
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
      },
    ],
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
