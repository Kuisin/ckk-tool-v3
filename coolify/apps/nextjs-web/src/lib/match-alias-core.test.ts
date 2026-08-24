import { describe, expect, it } from "vitest";
import { aliasKeyFor, aliasLearning, aliasLearnings } from "./match-alias-core";

/**
 * 学習するのは「人が結び直したとき」だけ。自動で当たった分を貯めても増える
 * のは行数だけで、曖昧な表記を覚えると**次から黙って間違える**ようになる。
 */

const item = (productText: string | null, productId: string | null) => ({
  productText,
  productId,
});

const base = {
  extractedCustomerName: null as string | null,
  customer: { before: null as string | null, after: null as string | null },
  items: { before: [], after: [] },
};

describe("aliasKeyFor", () => {
  it("対象ごとの正規化を使う（突合と同じ関数）", () => {
    // 取引先: 法人格・記号のゆれを吸収する。
    expect(aliasKeyFor("business_partners", "㈱稔産業")).toBe(
      aliasKeyFor("business_partners", "株式会社 稔産業"),
    );
    // 製品: 寸法記号のゆれを吸収する。
    expect(aliasKeyFor("products", "カッター φ8.3×330")).toBe(
      aliasKeyFor("products", "カッター 8.3x330"),
    );
  });
});

describe("aliasLearning", () => {
  it("表記とマスタが揃っていれば組み立てる", () => {
    expect(aliasLearning("products", "12", " OHリーマ ")).toEqual({
      targetType: "products",
      targetId: "12",
      alias: "OHリーマ",
      aliasKey: aliasKeyFor("products", "OHリーマ"),
    });
  });

  it("**短すぎる表記は学習しない**（断片に 1 マスタを割り当てない）", () => {
    expect(aliasLearning("products", "12", "A")).toBeNull();
    // 記号だけの表記は正規化すると消える。
    expect(aliasLearning("products", "12", "（）")).toBeNull();
  });

  it("マスタ・表記が欠けていれば学習しない", () => {
    expect(aliasLearning("products", null, "ドリル")).toBeNull();
    expect(aliasLearning("products", "12", "   ")).toBeNull();
  });
});

describe("aliasLearnings", () => {
  it("顧客を未特定から特定にしたら、抽出された社名を覚える", () => {
    const out = aliasLearnings({
      ...base,
      extractedCustomerName: "株式会社クラタ 名古屋営業所",
      customer: { before: null, after: "bp-1" },
    });
    expect(out).toEqual([
      {
        targetType: "business_partners",
        targetId: "bp-1",
        alias: "株式会社クラタ 名古屋営業所",
        aliasKey: aliasKeyFor(
          "business_partners",
          "株式会社クラタ 名古屋営業所",
        ),
      },
    ]);
  });

  it("顧客を別の取引先へ付け替えたときも覚える（最後の訂正が勝つ）", () => {
    const out = aliasLearnings({
      ...base,
      extractedCustomerName: "武蔵精密工業",
      customer: { before: "bp-1", after: "bp-2" },
    });
    expect(out.map((l) => l.targetId)).toEqual(["bp-2"]);
  });

  it("顧客が変わっていなければ覚えない（自動で当たった分は貯めない）", () => {
    expect(
      aliasLearnings({
        ...base,
        extractedCustomerName: "武蔵精密工業",
        customer: { before: "bp-1", after: "bp-1" },
      }),
    ).toEqual([]);
  });

  it("手入力（抽出された社名が無い）ときは覚えない", () => {
    expect(
      aliasLearnings({
        ...base,
        extractedCustomerName: null,
        customer: { before: null, after: "bp-1" },
      }),
    ).toEqual([]);
  });

  it("明細の製品を人が選んだら、その品名を覚える", () => {
    const out = aliasLearnings({
      ...base,
      items: {
        before: [item("OHリーマ φ8.3", null)],
        after: [item("OHリーマ φ8.3", "5")],
      },
    });
    expect(out).toEqual([
      {
        targetType: "products",
        targetId: "5",
        alias: "OHリーマ φ8.3",
        aliasKey: aliasKeyFor("products", "OHリーマ φ8.3"),
      },
    ]);
  });

  it("既に同じ製品なら覚えない / 付け替えたら覚える", () => {
    expect(
      aliasLearnings({
        ...base,
        items: { before: [item("ドリル", "5")], after: [item("ドリル", "5")] },
      }),
    ).toEqual([]);
    const moved = aliasLearnings({
      ...base,
      items: { before: [item("ドリル", "5")], after: [item("ドリル", "9")] },
    });
    expect(moved.map((l) => l.targetId)).toEqual(["9"]);
  });

  it("**同じ品名が別々の製品に結ばれている書類は覚えない**（どちらか決められない）", () => {
    expect(
      aliasLearnings({
        ...base,
        items: {
          before: [],
          after: [item("ドリル", "5"), item("ドリル", "9")],
        },
      }),
    ).toEqual([]);
  });

  it("品名が空の行・未突合の行は対象外", () => {
    expect(
      aliasLearnings({
        ...base,
        items: {
          before: [],
          after: [item(null, "5"), item("ドリル", null), item("  ", "7")],
        },
      }),
    ).toEqual([]);
  });

  it("顧客と明細を同時に直したら両方覚える", () => {
    const out = aliasLearnings({
      extractedCustomerName: "稔産業",
      customer: { before: null, after: "bp-1" },
      items: { before: [item("ドリル", null)], after: [item("ドリル", "5")] },
    });
    expect(out.map((l) => l.targetType)).toEqual([
      "business_partners",
      "products",
    ]);
  });
});
