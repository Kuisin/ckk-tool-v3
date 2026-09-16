import { describe, expect, it } from "vitest";
import {
  type CustomerProductCodeEntry,
  customerFacingProductLabel,
  matchCustomerProductCode,
} from "./customer-product-code-core";

const entries: CustomerProductCodeEntry[] = [
  {
    productId: 1,
    code: "AB-1000",
    name: "特殊カッター A",
    aliases: ["AB1000-OLD"],
  },
  { productId: 2, code: "AB-1000-2", name: null, aliases: [] },
  { productId: 3, code: "ZZ-9", name: "ロングカッター", aliases: [] },
];

describe("matchCustomerProductCode", () => {
  it("品番がそのまま一致すれば exact で決まる", () => {
    expect(matchCustomerProductCode(["AB-1000"], entries)).toEqual({
      productId: 1,
      matchedKey: "AB-1000",
      via: "code",
      confidence: "exact",
    });
  });

  it("前後の空白は落とす", () => {
    expect(matchCustomerProductCode(["  AB-1000 "], entries)?.productId).toBe(
      1,
    );
  });

  it("全角・記号・大小文字の揺れは正規化で吸収する", () => {
    // 全角の品番、ハイフン無し、小文字。
    expect(matchCustomerProductCode(["ＡＢ１０００"], entries)?.productId).toBe(
      1,
    );
    expect(matchCustomerProductCode(["ab1000"], entries)).toMatchObject({
      productId: 1,
      confidence: "normalized",
    });
  });

  it("部分一致はしない — AB-1000 は AB-1000-2 を掴まない（逆も同じ）", () => {
    expect(matchCustomerProductCode(["AB-1000-2"], entries)?.productId).toBe(2);
    expect(matchCustomerProductCode(["AB-100"], entries)).toBeNull();
    expect(matchCustomerProductCode(["AB-1000-25"], entries)).toBeNull();
  });

  it("追加表記（旧品番）でも当たる — via は alias", () => {
    expect(matchCustomerProductCode(["AB1000-OLD"], entries)).toEqual({
      productId: 1,
      matchedKey: "AB1000-OLD",
      via: "alias",
      confidence: "exact",
    });
  });

  it("顧客品名でも当たる", () => {
    expect(matchCustomerProductCode(["ロングカッター"], entries)).toMatchObject(
      { productId: 3, via: "name" },
    );
  });

  it("読み取りは具体的な順に見る — 品番欄が当たれば品名欄は見ない", () => {
    const hit = matchCustomerProductCode(["ZZ-9", "特殊カッター A"], entries);
    expect(hit).toMatchObject({ productId: 3, via: "code" });
  });

  it("品番欄が空でも品名欄で当たる", () => {
    expect(
      matchCustomerProductCode([null, "特殊カッター A"], entries)?.productId,
    ).toBe(1);
  });

  it("exact が normalized より先 — 段をまたいで読み取り順に引きずられない", () => {
    const pool: CustomerProductCodeEntry[] = [
      { productId: 10, code: "X-100" },
      // 正規化すると "X100" で衝突するが、そのままの一致は別。
      { productId: 11, code: "X100" },
    ];
    expect(matchCustomerProductCode(["X100"], pool)).toEqual({
      productId: 11,
      matchedKey: "X100",
      via: "code",
      confidence: "exact",
    });
  });

  it("正規化して別の製品に割れたら当てない（曖昧なら人に選ばせる）", () => {
    const pool: CustomerProductCodeEntry[] = [
      { productId: 10, code: "X-100" },
      { productId: 11, code: "X 100" },
    ];
    expect(matchCustomerProductCode(["X100"], pool)).toBeNull();
  });

  it("同じ製品の別表記に複数当たるのは構わない", () => {
    const pool: CustomerProductCodeEntry[] = [
      { productId: 10, code: "X-100", aliases: ["X100"] },
    ];
    expect(matchCustomerProductCode(["X100"], pool)).toMatchObject({
      productId: 10,
      via: "alias",
      confidence: "exact",
    });
  });

  it("短すぎる表記では当てない（品番 2 文字未満・品名 4 文字未満）", () => {
    const pool: CustomerProductCodeEntry[] = [
      { productId: 10, code: "A" },
      { productId: 11, code: "BBBB", name: "刃" },
    ];
    expect(matchCustomerProductCode(["A"], pool)).toBeNull();
    expect(matchCustomerProductCode(["刃"], pool)).toBeNull();
    expect(matchCustomerProductCode(["BBBB"], pool)?.productId).toBe(11);
  });

  it("対応表が空・読み取りが空なら null", () => {
    expect(matchCustomerProductCode(["AB-1000"], [])).toBeNull();
    expect(matchCustomerProductCode([null, "", "  "], entries)).toBeNull();
  });
});

describe("customerFacingProductLabel", () => {
  it("登録が無ければ自社の品名だけ（既存書類の見た目は変わらない）", () => {
    expect(customerFacingProductLabel("超硬カッター", null)).toBe(
      "超硬カッター",
    );
    expect(
      customerFacingProductLabel("超硬カッター", { code: "", name: null }),
    ).toBe("超硬カッター");
  });

  it("顧客の品名と品番を括弧で添える", () => {
    expect(
      customerFacingProductLabel("超硬カッター", {
        code: "AB-1000",
        name: "特殊カッター A",
      }),
    ).toBe("超硬カッター（特殊カッター A AB-1000）");
  });

  it("品番だけの登録なら品番だけ添える", () => {
    expect(
      customerFacingProductLabel("超硬カッター", {
        code: "AB-1000",
        name: null,
      }),
    ).toBe("超硬カッター（AB-1000）");
  });

  it("顧客品名が自社品名と同じなら重ねない", () => {
    expect(
      customerFacingProductLabel("超硬カッター", {
        code: "",
        name: "超硬カッター",
      }),
    ).toBe("超硬カッター");
  });
});
