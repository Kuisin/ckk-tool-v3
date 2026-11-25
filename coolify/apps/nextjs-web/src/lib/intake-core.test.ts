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
  it("法人コード付きの id を分解する（いまの形）", () => {
    expect(parseIntakeFileNumber("CKK~ORD-2026-00003-注文書 5.pdf")).toEqual({
      number: "CKK~ORD-2026-00003",
      docNumber: "ORD-2026-00003",
      docKey: { docRef: "CKK/ORD-2026-00003" },
      rest: "注文書 5.pdf",
    });
  });

  it("同じ番号でも法人が違えば別の行を指す", () => {
    const a = parseIntakeFileNumber("CKK~ORD-2026-00003-a.pdf");
    const b = parseIntakeFileNumber("SUB~ORD-2026-00003-a.pdf");
    expect(a?.docKey).toEqual({ docRef: "CKK/ORD-2026-00003" });
    expect(b?.docKey).toEqual({ docRef: "SUB/ORD-2026-00003" });
    expect(a?.docNumber).toBe(b?.docNumber);
  });

  it("法人コードの無い番号は鍵が決まらない（呼び出し側が DB で引く）", () => {
    expect(parseIntakeFileNumber("ORD-2026-00003-注文書.pdf")).toEqual({
      number: "ORD-2026-00003",
      docNumber: "ORD-2026-00003",
      docKey: null,
      rest: "注文書.pdf",
    });
  });

  it("番号設計 PR-C より前に焼き込まれた旧番号も読む", () => {
    expect(parseIntakeFileNumber("ORD-202608-00003-注文書 5.pdf")).toEqual({
      number: "ORD-202608-00003",
      docNumber: "ORD-202608-00003",
      docKey: null,
      rest: "注文書 5.pdf",
    });
  });

  it("番号が無い / 形が違う名前は null", () => {
    expect(parseIntakeFileNumber("注文書.pdf")).toBeNull();
    expect(parseIntakeFileNumber("ORD-2026-3-注文書.pdf")).toBeNull();
    expect(parseIntakeFileNumber("ORD-202608-3-注文書.pdf")).toBeNull();
    expect(parseIntakeFileNumber("ORD-2026-00003.pdf")).toBeNull();
    expect(parseIntakeFileNumber("CKK~QOT-2026-00003-見積.pdf")).toBeNull();
    // 元のファイル名がたまたま ~ を含んでいても番号とは見なさない
    expect(parseIntakeFileNumber("注文~書-2026.pdf")).toBeNull();
  });

  it("置かれたばかりの名前（日時_乱数_元名）は、元名が id で始まっていても番号付きではない", () => {
    // 取込フォルダへ置く口は元名の前に日時と乱数を付ける。法人コードは ~ と空白
    // 以外の何でもよいので、ここを弾かないと日時ごと「法人コード」に読める。
    expect(
      parseIntakeFileNumber(
        "20260815-101500_ab3d2f_CKK~ORD-2026-00003-注文書.pdf",
      ),
    ).toBeNull();
    expect(
      parseIntakeFileNumber("20260815-101500_ab3d2f_mail_a-at-b.jp_x.pdf"),
    ).toBeNull();
    // 採番後に id を焼き込めば、その行の続きとして読める
    expect(
      parseIntakeFileNumber(
        intakeFileName(
          "CKK~ORD-2026-00004",
          "20260815-101500_ab3d2f_CKK~ORD-2026-00003-注文書.pdf",
        ),
      ),
    ).toMatchObject({
      number: "CKK~ORD-2026-00004",
      rest: "20260815-101500_ab3d2f_CKK~ORD-2026-00003-注文書.pdf",
    });
  });

  it("id は付け替える（重ねない）", () => {
    expect(intakeFileName("CKK~ORD-2026-00003", "注文書.pdf")).toBe(
      "CKK~ORD-2026-00003-注文書.pdf",
    );
    expect(
      intakeFileName("CKK~ORD-2026-00004", "CKK~ORD-2026-00003-注文書.pdf"),
    ).toBe("CKK~ORD-2026-00004-注文書.pdf");
    // 旧番号付きの名前に新しい id を付けても重ならない
    expect(
      intakeFileName("CKK~ORD-2026-00004", "ORD-202608-00003-注文書.pdf"),
    ).toBe("CKK~ORD-2026-00004-注文書.pdf");
  });

  it("組み立てた名前はそのまま読み戻せる", () => {
    const name = intakeFileName("SUB~ORD-2026-00042", "PO 123.pdf");
    expect(parseIntakeFileNumber(name)).toEqual({
      number: "SUB~ORD-2026-00042",
      docNumber: "ORD-2026-00042",
      docKey: { docRef: "SUB/ORD-2026-00042" },
      rest: "PO 123.pdf",
    });
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

  it("再研磨は他の語と同居しても再研磨（顧客の工具を預かって返す注文）", () => {
    expect(normalizeOrderType("再研磨")).toBe("REGRIND");
    expect(normalizeOrderType("再研")).toBe("REGRIND");
    expect(normalizeOrderType("Regrind")).toBe("REGRIND");
    expect(normalizeOrderType("リグラインド")).toBe("REGRIND");
    expect(normalizeOrderType("再研磨（本番品）")).toBe("REGRIND");
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
