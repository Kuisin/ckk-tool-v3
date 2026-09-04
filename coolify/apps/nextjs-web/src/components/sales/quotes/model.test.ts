/**
 * model.test.ts — 価格表からの単価解決（resolveUnitPriceFromEntries）の
 * 有効性判定。見積書・注文請書・価格照合が同じ関数を通るので、ここが甘いと
 * 期限切れの価格がそのまま書類に載る。
 */

import { describe, expect, it } from "vitest";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import type { Tr } from "@/lib/i18n";
import { resolveUnitPriceFromEntries } from "./model";

/** テスト用の最小 tr — key と params をそのまま文字列化する。 */
const tr = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as Tr;

const CUSTOMER = "bp-1";
const PRODUCT = "1001";

const entry = (over: Partial<PriceListEntry> = {}): PriceListEntry => ({
  entryId: "PRC-202604-00001",
  customerId: CUSTOMER,
  customerName: "顧客",
  productId: PRODUCT,
  productName: "製品",
  currency: "JPY",
  isActive: true,
  variants: [
    {
      id: "v-prod",
      orderType: "PRODUCTION",
      baseUnitPrice: 1000,
      validFrom: "2026-04-01",
      validUntil: "2026-09-30",
      isActive: true,
      tiers: [
        {
          id: "t-1",
          minQuantity: 1,
          maxQuantity: 9,
          multiplier: 1,
          priceOverride: null,
        },
        {
          id: "t-2",
          minQuantity: 10,
          maxQuantity: 99,
          multiplier: 0.9,
          priceOverride: null,
        },
      ],
      discounts: [],
      estimateId: null,
      estimateNumber: null,
    },
    {
      id: "v-test",
      orderType: "TEST",
      baseUnitPrice: 500,
      validFrom: "2026-01-01",
      validUntil: null,
      isActive: false,
      tiers: [
        {
          id: "t-test",
          minQuantity: 1,
          maxQuantity: null,
          multiplier: 1,
          priceOverride: null,
        },
      ],
      discounts: [],
      estimateId: null,
      estimateNumber: null,
    },
    {
      id: "v-other",
      orderType: "OTHER",
      baseUnitPrice: 700,
      validFrom: "2026-01-01",
      validUntil: null,
      isActive: true,
      tiers: [
        {
          id: "t-other",
          minQuantity: 1,
          maxQuantity: null,
          multiplier: 1,
          priceOverride: null,
        },
      ],
      discounts: [],
      estimateId: null,
      estimateNumber: null,
    },
  ],
  salesRepId: null,
  salesRepName: null,
  createdBy: "—",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...over,
});

const resolve = (
  entries: PriceListEntry[],
  orderType: string,
  quantity: number,
  date: Date,
) =>
  resolveUnitPriceFromEntries(
    entries,
    CUSTOMER,
    PRODUCT,
    orderType,
    quantity,
    tr,
    date,
  );

const IN_WINDOW = new Date("2026-06-15T03:00:00Z");

describe("resolveUnitPriceFromEntries — 有効期間・状態", () => {
  it("有効期間内・有効な段階があれば単価を返す", () => {
    expect(resolve([entry()], "PRODUCTION", 5, IN_WINDOW)).toMatchObject({
      unitPrice: 1000,
      tierId: "t-1",
    });
    expect(resolve([entry()], "PRODUCTION", 10, IN_WINDOW)?.unitPrice).toBe(
      900,
    );
  });

  it("有効終了日を過ぎたバリアントは価格表なし（null）", () => {
    expect(
      resolve([entry()], "PRODUCTION", 5, new Date("2026-10-01T03:00:00Z")),
    ).toBeNull();
  });

  it("有効開始日より前は null", () => {
    expect(
      resolve([entry()], "PRODUCTION", 5, new Date("2026-03-31T03:00:00Z")),
    ).toBeNull();
  });

  it("開始日・終了日そのものは含む（JST の暦日で比べる）", () => {
    // 2026-03-31T15:30Z = JST 2026-04-01 00:30 — 開始日の朝から引ける
    expect(
      resolve([entry()], "PRODUCTION", 5, new Date("2026-03-31T15:30:00Z")),
    ).not.toBeNull();
    // 2026-09-30T14:59Z = JST 2026-09-30 23:59 — 終了日いっぱいまで有効
    expect(
      resolve([entry()], "PRODUCTION", 5, new Date("2026-09-30T14:59:00Z")),
    ).not.toBeNull();
    // 2026-09-30T15:30Z = JST 2026-10-01 00:30 — UTC の日付ではまだ 30 日だが失効
    expect(
      resolve([entry()], "PRODUCTION", 5, new Date("2026-09-30T15:30:00Z")),
    ).toBeNull();
  });

  it("終了日なし（無期限）はいつでも引ける", () => {
    expect(
      resolve([entry()], "OTHER", 3, new Date("2030-01-01T00:00:00Z"))
        ?.unitPrice,
    ).toBe(700);
  });

  it("無効化されたバリアントは null", () => {
    expect(resolve([entry()], "TEST", 1, IN_WINDOW)).toBeNull();
  });

  it("無効化されたエントリは全バリアント null", () => {
    const inactive = entry({ isActive: false });
    expect(resolve([inactive], "PRODUCTION", 5, IN_WINDOW)).toBeNull();
    expect(resolve([inactive], "OTHER", 5, IN_WINDOW)).toBeNull();
  });

  it("数量を覆う段階が無ければ null（エントリはあっても）", () => {
    expect(resolve([entry()], "PRODUCTION", 100, IN_WINDOW)).toBeNull();
  });

  it("エントリが無ければ null", () => {
    expect(resolve([], "PRODUCTION", 5, IN_WINDOW)).toBeNull();
    expect(
      resolveUnitPriceFromEntries(
        [entry()],
        "bp-other",
        PRODUCT,
        "PRODUCTION",
        5,
        tr,
        IN_WINDOW,
      ),
    ).toBeNull();
  });
});
