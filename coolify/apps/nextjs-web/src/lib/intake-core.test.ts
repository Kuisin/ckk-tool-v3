/**
 * intake-core.test.ts — 注文請書抽出の正規化テスト。
 */

import { describe, expect, it } from "vitest";
import {
  intakeFileName,
  normalizeDate,
  normalizeExtraction,
  normalizeOrderType,
  parseIntakeFileNumber,
} from "./intake-core";

describe("取込ファイル名の番号（二重登録の防止）", () => {
  it("番号付きの名前を分解する", () => {
    expect(parseIntakeFileNumber("ORD-202608-00003-注文書 5.pdf")).toEqual({
      number: "ORD-202608-00003",
      yearMonth: "202608",
      seq: 3,
      rest: "注文書 5.pdf",
    });
  });

  it("番号が無い / 形が違う名前は null", () => {
    expect(parseIntakeFileNumber("注文書.pdf")).toBeNull();
    expect(parseIntakeFileNumber("ORD-202608-3-注文書.pdf")).toBeNull();
    expect(parseIntakeFileNumber("ORD-202608-00003.pdf")).toBeNull();
  });

  it("番号は付け替える（重ねない）", () => {
    expect(intakeFileName("ORD-202608-00003", "注文書.pdf")).toBe(
      "ORD-202608-00003-注文書.pdf",
    );
    expect(
      intakeFileName("ORD-202608-00004", "ORD-202608-00003-注文書.pdf"),
    ).toBe("ORD-202608-00004-注文書.pdf");
  });
});

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

  it("0 以下の数量は読めなかった扱い（1 + 元の値を備考に）", () => {
    const out = normalizeExtraction({
      items: [
        { product_name: "A", quantity: 0 },
        { product_name: "B", quantity: -3 },
        { product_name: "C", quantity: 1 },
      ],
    });
    expect(out.items.map((it) => it.quantity)).toEqual([1, 1, 1]);
    expect(out.items[0].notes).toContain("0");
    expect(out.items[0].notes).toContain("要確認");
    expect(out.items[1].notes).toContain("-3");
    expect(out.items[2].notes).toBeNull();
  });

  it("負の単価は未入力（null）にする", () => {
    const out = normalizeExtraction({
      items: [
        { product_name: "A", quantity: 1, unit_price: -100 },
        { product_name: "B", quantity: 1, unit_price: 0 },
      ],
    });
    expect(out.items[0].unitPrice).toBeNull();
    expect(out.items[1].unitPrice).toBe(0);
  });

  it("完全な欠損にも耐える", () => {
    const out = normalizeExtraction(null);
    expect(out.items).toEqual([]);
    expect(out.customerName).toBeNull();
  });
});
