import { describe, expect, it } from "vitest";
import {
  billingBasisDate,
  EMPTY_TAX_CATALOG,
  rateOnDate,
  resolveLineTax,
  resolveTaxCategoryId,
  type TaxCatalog,
  type TaxCategoryRef,
  taxRateFor,
} from "./tax-rate";

function category(
  id: number,
  code: string,
  rates: Array<[string, number]>,
): TaxCategoryRef {
  return {
    id,
    code,
    nameJa: code,
    nameEn: code,
    shortLabelJa: null,
    shortLabelEn: null,
    rates: rates.map(([effectiveFrom, rate]) => ({ effectiveFrom, rate })),
  };
}

const STANDARD = category(1, "TAXABLE", [["1900-01-01", 0.1]]);
const REDUCED = category(2, "REDUCED", [["1900-01-01", 0.08]]);
const EXEMPT = category(3, "EXEMPT", [["1900-01-01", 0]]);

const CATALOG: TaxCatalog = {
  categories: [STANDARD, REDUCED, EXEMPT],
  defaultCategoryId: STANDARD.id,
};

describe("taxRateFor（旧・固定表。フォールバック専用）", () => {
  it("課税 / 軽減 / 非課税", () => {
    expect(taxRateFor("TAXABLE")).toBe(0.1);
    expect(taxRateFor("REDUCED")).toBe(0.08);
    expect(taxRateFor("EXEMPT")).toBe(0);
  });
  it("未指定・不明は課税扱い", () => {
    expect(taxRateFor(null)).toBe(0.1);
    expect(taxRateFor(undefined)).toBe(0.1);
    expect(taxRateFor("WHATEVER")).toBe(0.1);
  });
});

describe("rateOnDate", () => {
  // 1997-04-01 から 5%、2019-10-01 から 10% という履歴を例にする。
  const historical = category(9, "TAXABLE", [
    ["1997-04-01", 0.05],
    ["2019-10-01", 0.1],
    ["2014-04-01", 0.08], // 並び順はばらばらに入れておく
  ]);

  it("最初の適用開始日より前は null（呼び出し側がフォールバックを決める）", () => {
    expect(rateOnDate(historical, "1997-03-31")).toBeNull();
  });

  it("適用開始日ちょうどはその率（当日を含む）", () => {
    expect(rateOnDate(historical, "1997-04-01")).toBe(0.05);
    expect(rateOnDate(historical, "2019-10-01")).toBe(0.1);
  });

  it("2 つの適用開始日の間は古いほう", () => {
    expect(rateOnDate(historical, "2019-09-30")).toBe(0.08);
    expect(rateOnDate(historical, "2014-04-02")).toBe(0.08);
  });

  it("最後の適用開始日より後は最後の率", () => {
    expect(rateOnDate(historical, "2030-12-31")).toBe(0.1);
  });

  it("率行が無ければ null", () => {
    expect(rateOnDate(category(10, "NEW", []), "2026-06-04")).toBeNull();
  });
});

describe("resolveTaxCategoryId（顧客が優先）", () => {
  it("顧客に区分があれば顧客（製品は無視される）", () => {
    expect(resolveTaxCategoryId(3, 2, 1)).toBe(3);
  });
  it("顧客が null =「製品に従う」", () => {
    expect(resolveTaxCategoryId(null, 2, 1)).toBe(2);
  });
  it("どちらも null ならマスタの既定", () => {
    expect(resolveTaxCategoryId(null, null, 1)).toBe(1);
  });
  it("既定も無ければ null", () => {
    expect(resolveTaxCategoryId(null, null, null)).toBeNull();
  });
});

describe("resolveLineTax", () => {
  const on = (customer: number | null, product: number | null) =>
    resolveLineTax(CATALOG, {
      customerTaxCategoryId: customer,
      productTaxCategoryId: product,
      basisDate: "2026-06-04",
    });

  it("顧客指定 → CUSTOMER", () => {
    expect(on(REDUCED.id, STANDARD.id)).toEqual({
      categoryId: REDUCED.id,
      code: "REDUCED",
      rate: 0.08,
      resolvedFrom: "CUSTOMER",
    });
  });

  it("顧客が「製品に従う」→ PRODUCT", () => {
    expect(on(null, REDUCED.id)).toEqual({
      categoryId: REDUCED.id,
      code: "REDUCED",
      rate: 0.08,
      resolvedFrom: "PRODUCT",
    });
  });

  it("どちらも未指定 → DEFAULT", () => {
    expect(on(null, null)).toEqual({
      categoryId: STANDARD.id,
      code: "TAXABLE",
      rate: 0.1,
      resolvedFrom: "DEFAULT",
    });
  });

  // ★ 決定事項の回帰ロック。顧客優先は軽減税率の直感に反するので、
  //   ここが緑のままであることが「顧客が勝つ」の唯一の証明になる。
  it("非課税の顧客は、軽減税率の製品でも 0%（顧客が勝つ）", () => {
    const t = on(EXEMPT.id, REDUCED.id);
    expect(t.rate).toBe(0);
    expect(t.resolvedFrom).toBe("CUSTOMER");
  });

  it("マスタが空なら旧挙動（課税 10%）へ落ちる", () => {
    const t = resolveLineTax(EMPTY_TAX_CATALOG, {
      customerTaxCategoryId: null,
      productTaxCategoryId: null,
      basisDate: "2026-06-04",
    });
    expect(t).toEqual({
      categoryId: null,
      code: null,
      rate: 0.1,
      resolvedFrom: "FALLBACK",
    });
  });

  it("参照先の区分が消えていても落ちない（FALLBACK）", () => {
    const t = resolveLineTax(CATALOG, {
      customerTaxCategoryId: 999,
      productTaxCategoryId: null,
      basisDate: "2026-06-04",
    });
    expect(t.resolvedFrom).toBe("FALLBACK");
    expect(t.rate).toBe(0.1);
  });

  it("区分はあるが基準日に率行が無いときは、その区分のコードの旧値へ落ちる", () => {
    // 率の入れ忘れた非課税の区分が、黙って 10% で請求されてはいけない。
    const futureOnly: TaxCatalog = {
      categories: [category(5, "EXEMPT", [["2030-01-01", 0]])],
      defaultCategoryId: 5,
    };
    const t = resolveLineTax(futureOnly, {
      customerTaxCategoryId: null,
      productTaxCategoryId: null,
      basisDate: "2026-06-04",
    });
    expect(t).toEqual({
      categoryId: 5,
      code: "EXEMPT",
      rate: 0,
      resolvedFrom: "FALLBACK",
    });
  });

  it("基準日が違えば率も違う（税率改正をまたぐ）", () => {
    const catalog: TaxCatalog = {
      categories: [
        category(1, "TAXABLE", [
          ["1900-01-01", 0.08],
          ["2026-10-01", 0.1],
        ]),
      ],
      defaultCategoryId: 1,
    };
    const at = (basisDate: string) =>
      resolveLineTax(catalog, {
        customerTaxCategoryId: null,
        productTaxCategoryId: null,
        basisDate,
      }).rate;
    expect(at("2026-09-30")).toBe(0.08);
    expect(at("2026-10-01")).toBe(0.1);
  });
});

describe("billingBasisDate", () => {
  it("注文日があればそれ", () => {
    expect(billingBasisDate("2026-06-04", "2026-07-01", "2026-07-31")).toBe(
      "2026-06-04",
    );
  });
  it("注文日が無ければ出荷日", () => {
    expect(billingBasisDate(null, "2026-07-01", "2026-07-31")).toBe(
      "2026-07-01",
    );
  });
  it("どちらも無ければ締日", () => {
    expect(billingBasisDate(null, null, "2026-07-31")).toBe("2026-07-31");
    expect(billingBasisDate(undefined, undefined, "2026-07-31")).toBe(
      "2026-07-31",
    );
  });
});
