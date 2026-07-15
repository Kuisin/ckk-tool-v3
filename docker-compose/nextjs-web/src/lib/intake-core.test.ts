/**
 * intake-core.test.ts — 受注請書抽出の正規化テスト。
 */

import { describe, expect, it } from "vitest";
import {
  normalizeDate,
  normalizeExtraction,
  normalizeOrderType,
} from "./intake-core";

describe("normalizeOrderType", () => {
  it("表記ゆれを吸収", () => {
    expect(normalizeOrderType("本番")).toBe("PRODUCTION");
    expect(normalizeOrderType("Test")).toBe("TEST");
    expect(normalizeOrderType("サンプル")).toBe("SAMPLE");
    expect(normalizeOrderType(null)).toBe("PRODUCTION");
    expect(normalizeOrderType("特注")).toBe("OTHER");
  });
});

describe("normalizeDate", () => {
  it("区切りゆれを ISO へ", () => {
    expect(normalizeDate("2026/07/20")).toBe("2026-07-20");
    expect(normalizeDate("2026-7-3")).toBe("2026-07-03");
    expect(normalizeDate("来週")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
});

describe("normalizeExtraction", () => {
  it("典型的な抽出結果を正規化", () => {
    const out = normalizeExtraction({
      customer_name: " テスト精機株式会社 ",
      customer_order_ref: "TO-123",
      order_date: "2026/07/10",
      items: [
        {
          product_name: "エンドミル A",
          quantity: 50,
          order_type: "本番",
          unit_price: 1200,
          delivery_date: "2026/08/01",
        },
        { product_name: null, product_code: null }, // 空行は捨てる
        { product_name: "ドリル B", quantity: null }, // 数量欠損 → 1 + 要確認
      ],
    });
    expect(out.customerName).toBe("テスト精機株式会社");
    expect(out.customerOrderRef).toBe("TO-123");
    expect(out.orderDate).toBe("2026-07-10");
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({
      productText: "エンドミル A",
      quantity: 50,
      orderType: "PRODUCTION",
      unitPrice: 1200,
      deliveryDate: "2026-08-01",
    });
    expect(out.items[1].quantity).toBe(1);
    expect(out.items[1].notes).toContain("要確認");
  });

  it("完全な欠損にも耐える", () => {
    const out = normalizeExtraction(null);
    expect(out.items).toEqual([]);
    expect(out.customerName).toBeNull();
  });
});
