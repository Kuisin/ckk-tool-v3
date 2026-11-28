import { describe, expect, it } from "vitest";
import {
  acceptanceKeyOfLine,
  buildDocNumber,
  DOC_TABLE_PREFIX,
  docIdOf,
  docIdOrNull,
  docNo,
  docNumberOf,
  docNumberParts,
  formatDocNumber,
  formatOrderLineNumber,
  formatProductNumber,
  formatQuoteNumber,
  isLegacyDocNumber,
  isLegacyOrderLineNumber,
  isNewDocNumber,
  isNewOrderLineNumber,
  orderLineIdOf,
  orderLineNumberOf,
  orderLineWhereKey,
  parseDocKey,
  parseOrderLineKey,
  splitDocNumber,
} from "./doc-number";

describe("書類の 3 つの姿（番号 / 参照 / id）", () => {
  const row = { docRef: "CKK/QOT-2026-00001" };

  it("番号 — 人に見せる姿。法人コードは付かない", () => {
    expect(docNumberOf(row)).toBe("QOT-2026-00001");
    expect(formatDocNumber("QOT", row)).toBe("QOT-2026-00001");
    expect(formatQuoteNumber(row)).toBe("QOT-2026-00001");
  });

  it("id — URL・Server Action・画面の DTO が持つ姿", () => {
    expect(docIdOf(row)).toBe("CKK~QOT-2026-00001");
    expect(docIdOrNull(row)).toBe("CKK~QOT-2026-00001");
    expect(docIdOrNull(null)).toBeNull();
    expect(docIdOrNull(undefined)).toBeNull();
  });

  it("同じ番号でも法人が違えば別の id になる", () => {
    expect(docIdOf({ docRef: "SUB/QOT-2026-00001" })).toBe(
      "SUB~QOT-2026-00001",
    );
    expect(docNumberOf({ docRef: "SUB/QOT-2026-00001" })).toBe(
      docNumberOf(row),
    );
  });

  it("id と参照は鍵へ戻る（往復）", () => {
    expect(parseDocKey(docIdOf(row))).toEqual(row);
    expect(parseDocKey("CKK/QOT-2026-00001")).toEqual(row);
    expect(parseDocKey("CKK~QOT-2026-00001", "QOT")).toEqual(row);
  });

  it("URL で符号化されたままの id も読む", () => {
    expect(parseDocKey("CKK%7EQOT-2026-00001")).toEqual(row);
    // 壊れた符号化は例外にしない
    expect(parseDocKey("CKK%ZZQOT-2026-00001")).toBeNull();
  });

  it("番号だけ・旧番号・接頭辞違いは鍵にならない（DB を引く必要がある）", () => {
    expect(parseDocKey("QOT-2026-00001")).toBeNull();
    expect(parseDocKey("QOT-202607-00001")).toBeNull();
    expect(parseDocKey("CKK~QOT-202607-00001")).toBeNull();
    expect(parseDocKey("CKK~QOT-2026-00001", "INV")).toBeNull();
    expect(parseDocKey("")).toBeNull();
    expect(parseDocKey("not-a-number")).toBeNull();
  });
});

describe("docNo — id を表示用の番号にする", () => {
  it("法人コードを落とす（id でも参照でも）", () => {
    expect(docNo("CKK~QOT-2026-00001")).toBe("QOT-2026-00001");
    expect(docNo("CKK/QOT-2026-00001")).toBe("QOT-2026-00001");
    expect(docNo("CKK~ORD-2026-00001-02")).toBe("ORD-2026-00001-02");
  });

  it("番号だけ・旧番号はそのまま", () => {
    expect(docNo("QOT-2026-00001")).toBe("QOT-2026-00001");
    expect(docNo("QOT-202607-00001")).toBe("QOT-202607-00001");
  });

  it("書類番号でない文字列は切らない（ロット表記・パスなど）", () => {
    expect(docNo("10842")).toBe("10842");
    expect(docNo("A/B")).toBe("A/B");
    expect(docNo("約~3日")).toBe("約~3日");
    expect(docNo("")).toBe("");
  });

  it("id から作ったファイル名も番号だけになる", () => {
    expect(docNo("CKK~QOT-2026-00001.pdf")).toBe("QOT-2026-00001.pdf");
  });

  it("null / undefined を通す", () => {
    expect(docNo(null)).toBeNull();
    expect(docNo(undefined)).toBeNull();
  });
});

describe("番号の形", () => {
  it("新しい形 PREFIX-FFFF-NNNNN", () => {
    expect(isNewDocNumber("QOT-2026-00001")).toBe(true);
    expect(isNewDocNumber("PO-2026-00001", "PO")).toBe(true);
    expect(isNewDocNumber("QOT-2026-00001", "INV")).toBe(false);
    expect(isNewDocNumber("QOT-202607-00001")).toBe(false);
    expect(isNewDocNumber("QOT-2026-1")).toBe(false);
    expect(isNewDocNumber("CKK~QOT-2026-00001")).toBe(false);
  });

  it("旧い形 PREFIX-YYYYMM-NNNNN", () => {
    expect(isLegacyDocNumber("QOT-202607-00001")).toBe(true);
    expect(isLegacyDocNumber("QOT-202607-00001", "QOT")).toBe(true);
    expect(isLegacyDocNumber("QOT-202607-00001", "INV")).toBe(false);
    expect(isLegacyDocNumber("QOT-2026-00001")).toBe(false);
  });

  it("(接頭辞, 会計年度, 連番) から組み立てて、読み戻せる", () => {
    const number = buildDocNumber("INV", 2026, 42);
    expect(number).toBe("INV-2026-00042");
    expect(docNumberParts(number)).toEqual({
      prefix: "INV",
      fiscalYear: 2026,
      seq: 42,
    });
    // 法人コード付きでも読める
    expect(docNumberParts("CKK/INV-2026-00042")?.seq).toBe(42);
    expect(docNumberParts("CKK~INV-2026-00042")?.fiscalYear).toBe(2026);
    // 旧番号は会計年度を持たない
    expect(docNumberParts("INV-202607-00042")).toBeNull();
  });

  it("接頭辞の登録簿は表ごとに 1 つ・重複なし", () => {
    const prefixes = Object.values(DOC_TABLE_PREFIX);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(DOC_TABLE_PREFIX.quotes).toBe("QOT");
    expect(DOC_TABLE_PREFIX.material_purchase_orders).toBe("PO");
    expect(DOC_TABLE_PREFIX.outsource_orders).toBe("OUT");
  });
});

describe("製品コード（月次の通し番号のまま）", () => {
  it("PRD-YYYYMM-NNNN", () => {
    expect(formatProductNumber("202607", 12)).toBe("PRD-202607-0012");
  });
  it("未採番（レガシー取込）は null", () => {
    expect(formatProductNumber(null, 1)).toBeNull();
    expect(formatProductNumber("202607", null)).toBeNull();
  });
});

describe("注文明細（ORD-FFFF-NNNNN-NN）", () => {
  const line = { lineRef: "CKK/ORD-2026-00001-02" };

  it("番号と id", () => {
    expect(formatOrderLineNumber(line)).toBe("ORD-2026-00001-02");
    expect(orderLineNumberOf(line)).toBe("ORD-2026-00001-02");
    expect(orderLineIdOf(line)).toBe("CKK~ORD-2026-00001-02");
  });

  it("枝番の無い行（確定前）は番号も id も持たない", () => {
    expect(orderLineNumberOf({ lineRef: null })).toBeNull();
    expect(orderLineIdOf({ lineRef: null })).toBeNull();
  });

  it("id / 参照は鍵へ戻る", () => {
    expect(parseOrderLineKey("CKK~ORD-2026-00001-02")).toEqual(line);
    expect(parseOrderLineKey("CKK/ORD-2026-00001-02")).toEqual(line);
    expect(parseOrderLineKey("CKK%7EORD-2026-00001-02")).toEqual(line);
  });

  it("法人コードなし・旧番号・枝番なしは鍵にならない", () => {
    expect(parseOrderLineKey("ORD-2026-00001-02")).toBeNull();
    expect(parseOrderLineKey("CKK~ORD-202607-00001-02")).toBeNull();
    expect(parseOrderLineKey("CKK~ORD-2026-00001")).toBeNull();
    expect(parseOrderLineKey("CKK~QOT-2026-00001-02")).toBeNull();
  });

  it("where は line_ref（UNIQUE）で引く", () => {
    expect(orderLineWhereKey(line)).toEqual({
      lineRef: "CKK/ORD-2026-00001-02",
    });
  });

  it("明細の参照から注文請書の鍵が出る（法人は同じ）", () => {
    expect(acceptanceKeyOfLine(line)).toEqual({
      docRef: "CKK/ORD-2026-00001",
    });
  });

  it("番号の形の見分け", () => {
    expect(isNewOrderLineNumber("ORD-2026-00001-02")).toBe(true);
    expect(isNewOrderLineNumber("ORD-2026-00001")).toBe(false);
    expect(isLegacyOrderLineNumber("ORD-202607-00001-02")).toBe(true);
    expect(isLegacyOrderLineNumber("ORD-2026-00001-02")).toBe(false);
  });
});

describe("splitDocNumber", () => {
  it("よくある書類番号を接頭辞と番号に分ける", () => {
    expect(splitDocNumber("ORD-2026-00042")).toEqual({
      prefix: "ORD-",
      rest: "2026-00042",
    });
    expect(splitDocNumber("QOT-2026-00001")).toEqual({
      prefix: "QOT-",
      rest: "2026-00001",
    });
    expect(splitDocNumber("PO-2026-00007")).toEqual({
      prefix: "PO-",
      rest: "2026-00007",
    });
  });

  it("id（法人コード付き）を渡されたら法人コードは落としてから切る", () => {
    expect(splitDocNumber("CKK~ORD-2026-00042")).toEqual({
      prefix: "ORD-",
      rest: "2026-00042",
    });
    expect(splitDocNumber("CKK/ORD-2026-00042")).toEqual({
      prefix: "ORD-",
      rest: "2026-00042",
    });
  });

  it("旧番号もそのまま分けられる", () => {
    expect(splitDocNumber("ORD-202609-00042")).toEqual({
      prefix: "ORD-",
      rest: "202609-00042",
    });
  });

  it("枝番付き（注文明細）も接頭辞だけを切る", () => {
    expect(splitDocNumber("ORD-2026-00042-01")).toEqual({
      prefix: "ORD-",
      rest: "2026-00042-01",
    });
  });

  // ロット番号のような接頭辞なしの番号もこの部品に来る。
  // 無理に切ると数字の頭が薄くなって読み違える
  it("接頭辞を持たない番号はそのまま", () => {
    expect(splitDocNumber("10842")).toEqual({ prefix: "", rest: "10842" });
    expect(splitDocNumber("")).toEqual({ prefix: "", rest: "" });
  });

  it("小文字・長すぎる語は接頭辞と見なさない", () => {
    expect(splitDocNumber("ord-2026-1").prefix).toBe("");
    expect(splitDocNumber("PREFIX-2026-1").prefix).toBe("");
  });

  it("ハイフンの後ろが空なら切らない", () => {
    expect(splitDocNumber("ORD-")).toEqual({ prefix: "", rest: "ORD-" });
  });
});
