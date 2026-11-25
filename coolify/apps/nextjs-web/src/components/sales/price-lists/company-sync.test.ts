import { describe, expect, it } from "vitest";
import { resolveUnitPriceFromEntries } from "../quotes/model";
import {
  companySyncState,
  comparePriceContent,
  counterpartStatuses,
  counterpartsOf,
  entriesForCompany,
  syncVariantsFrom,
} from "./company-sync";
import type { PriceListEntry, PriceVariant } from "./model";

const variant = (over: Partial<PriceVariant> = {}): PriceVariant => ({
  id: "v1",
  orderType: "PRODUCTION",
  baseUnitPrice: 1000,
  validFrom: "2026-01-01",
  validUntil: null,
  isActive: true,
  tiers: [
    {
      id: "t1",
      minQuantity: 1,
      maxQuantity: 99,
      multiplier: 1,
      priceOverride: null,
    },
    {
      id: "t2",
      minQuantity: 100,
      maxQuantity: null,
      multiplier: 0.9,
      priceOverride: null,
    },
  ],
  discounts: [],
  estimateId: null,
  estimateNumber: null,
  ...over,
});

const entry = (over: Partial<PriceListEntry> = {}): PriceListEntry => ({
  entryId: "CKK~PRC-2026-00001",
  ownCompanyId: 1,
  ownCompanyCode: "CKK",
  ownCompanyName: "CKK",
  customerId: "bp-1",
  customerName: "顧客A",
  itemId: "10",
  productName: "製品",
  itemType: "PRODUCT",
  toolItemId: null,
  toolName: null,
  standardUnitPrice: null,
  currency: "JPY",
  isActive: true,
  variants: [variant()],
  salesRepId: null,
  salesRepName: null,
  createdBy: "—",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

/** 同じ中身で、会社・番号・id・日時だけが違う相手方。 */
const twin = (over: Partial<PriceListEntry> = {}) =>
  entry({
    entryId: "TSP~PRC-2026-00007",
    ownCompanyId: 2,
    ownCompanyCode: "TSP",
    ownCompanyName: "TSP",
    salesRepId: "u-9",
    createdAt: "2026-05-05T00:00:00Z",
    updatedAt: "2026-06-06T00:00:00Z",
    variants: [
      variant({
        id: "v9",
        estimateId: "TSP~EST-2026-00003",
        estimateNumber: "TSP~EST-2026-00003",
        tiers: [
          {
            id: "t9",
            minQuantity: 1,
            maxQuantity: 99,
            multiplier: 1,
            priceOverride: null,
          },
          {
            id: "t8",
            minQuantity: 100,
            maxQuantity: null,
            multiplier: 0.9,
            priceOverride: null,
          },
        ],
      }),
    ],
    ...over,
  });

describe("entriesForCompany — 解決は書類の発行会社の価格表だけ", () => {
  it("keeps only the document company's entries", () => {
    const list = [entry(), twin()];
    expect(entriesForCompany(list, 2).map((e) => e.entryId)).toEqual([
      "TSP~PRC-2026-00007",
    ]);
  });
  it("resolves the document company's price, never the other company's", () => {
    const tr = ((k: string) => k) as never;
    const ckk = entry();
    const tsp = twin({ variants: [variant({ baseUnitPrice: 2000 })] });
    const date = new Date("2026-06-01T03:00:00Z");
    const priceFor = (company: number) =>
      resolveUnitPriceFromEntries(
        entriesForCompany([ckk, tsp], company),
        "bp-1",
        "10",
        "PRODUCTION",
        10,
        tr,
        date,
      )?.unitPrice ?? null;
    expect(priceFor(1)).toBe(1000);
    expect(priceFor(2)).toBe(2000);
    // 3 社目には価格表が無い — 他社の価格へ落ちない。
    expect(priceFor(3)).toBeNull();
  });

  it("returns nothing when the company is unknown — never another company's price", () => {
    expect(entriesForCompany([entry(), twin()], null)).toEqual([]);
  });
});

describe("counterpartsOf", () => {
  it("matches the same customer × item × tool in another company", () => {
    const other = twin();
    const otherItem = twin({ entryId: "x", itemId: "11" });
    const otherTool = twin({ entryId: "y", toolItemId: "5" });
    const sameCompany = entry({ entryId: "z" });
    expect(
      counterpartsOf(entry(), [
        entry(),
        other,
        otherItem,
        otherTool,
        sameCompany,
      ]),
    ).toEqual([other]);
  });
});

describe("comparePriceContent — 中身だけを比べる", () => {
  it("ignores ids, numbers, timestamps, company, sales rep and estimate links", () => {
    expect(comparePriceContent(entry(), twin())).toEqual([]);
  });

  it("ignores row order (tiers by min quantity, discounts by label)", () => {
    const d = (label: string) => ({
      id: label,
      label,
      discountType: "RATE" as const,
      value: 5,
      minQuantity: 1,
      maxQuantity: null,
      validFrom: "2026-01-01",
      validUntil: null,
      isActive: true,
    });
    const a = entry({
      variants: [variant({ discounts: [d("夏"), d("冬")] })],
    });
    const b = twin({
      variants: [
        variant({
          tiers: [...variant().tiers].reverse(),
          discounts: [d("冬"), d("夏")],
        }),
      ],
    });
    expect(comparePriceContent(a, b)).toEqual([]);
  });

  it("reports a changed tier with both rows", () => {
    const b = twin({
      variants: [
        variant({
          tiers: [
            variant().tiers[0],
            { ...variant().tiers[1], multiplier: 0.85 },
          ],
        }),
      ],
    });
    const diffs = comparePriceContent(entry(), b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      kind: "tier",
      orderType: "PRODUCTION",
      index: 1,
      here: { multiplier: 0.9 },
      there: { multiplier: 0.85 },
    });
  });

  it("reports variant fields, missing order types and missing discount rows", () => {
    const b = twin({
      variants: [
        variant({ baseUnitPrice: 1200, validUntil: "2026-12-31" }),
        variant({ id: "v2", orderType: "TEST", validUntil: "2026-03-31" }),
      ],
    });
    const a = entry({
      variants: [
        variant({
          discounts: [
            {
              id: "d",
              label: "大口",
              discountType: "AMOUNT",
              value: 50,
              minQuantity: 500,
              maxQuantity: null,
              validFrom: "2026-01-01",
              validUntil: null,
              isActive: true,
            },
          ],
        }),
      ],
    });
    const diffs = comparePriceContent(a, b);
    expect(diffs.map((d) => d.kind)).toEqual([
      "variantField",
      "variantField",
      "discount",
      "variant",
    ]);
    expect(diffs[0]).toMatchObject({
      field: "baseUnitPrice",
      here: 1000,
      there: 1200,
    });
    expect(diffs[2]).toMatchObject({ kind: "discount", there: null });
    expect(diffs[3]).toMatchObject({
      orderType: "TEST",
      here: false,
      there: true,
    });
  });
});

describe("counterpartStatuses / companySyncState", () => {
  it("is null without counterparts, same / diff otherwise", () => {
    expect(companySyncState(entry(), [entry()])).toBeNull();
    expect(companySyncState(entry(), [entry(), twin()])).toBe("same");
    const changed = twin({ variants: [variant({ baseUnitPrice: 1 })] });
    expect(companySyncState(entry(), [entry(), changed])).toBe("diff");
    const [s] = counterpartStatuses(entry(), [entry(), changed]);
    expect(s).toMatchObject({ ownCompanyCode: "TSP", same: false });
  });
});

describe("syncVariantsFrom — 相手方の中身で上書きする入力", () => {
  it("keeps existing variant and tier ids by order type and position", () => {
    const target = entry();
    const source = twin({
      variants: [
        variant({
          id: "v9",
          baseUnitPrice: 1500,
          tiers: [
            ...twin().variants[0].tiers,
            {
              id: "t7",
              minQuantity: 500,
              maxQuantity: null,
              multiplier: 0.8,
              priceOverride: 700,
            },
          ],
        }),
        variant({ id: "v8", orderType: "SAMPLE", estimateNumber: "TSP~EST-1" }),
      ],
    });
    const out = syncVariantsFrom(target, source);
    expect(out[0]).toMatchObject({
      id: "v1",
      baseUnitPrice: 1500,
      estimateNumber: null,
    });
    expect(out[0].tiers.map((t) => t.id)).toEqual(["t1", "t2", null]);
    expect(out[0].tiers[2]).toMatchObject({
      minQuantity: 500,
      priceOverride: 700,
    });
    // 相手方にしかない種別は新規 — 価格試算リンクも引き継ぐ。
    expect(out[1]).toMatchObject({
      id: null,
      orderType: "SAMPLE",
      estimateNumber: "TSP~EST-1",
    });
    // 同期した結果は相手方と同じ中身になる。
    const synced = entry({
      variants: out.map((v) => ({
        ...v,
        id: v.id ?? "new",
        estimateId: v.estimateNumber,
        tiers: v.tiers.map((t) => ({ ...t, id: t.id ?? "new" })),
        discounts: v.discounts.map((d) => ({ ...d, id: "d" })),
      })),
    });
    expect(comparePriceContent(synced, source)).toEqual([]);
  });

  it("copies everything as new rows when there is no target", () => {
    const out = syncVariantsFrom(null, twin());
    expect(out[0].id).toBeNull();
    expect(out[0].tiers.every((t) => t.id === null)).toBe(true);
    expect(out[0].estimateNumber).toBe("TSP~EST-2026-00003");
  });
});
