import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import {
  applySpecValues,
  decomposeSpec,
  materialSpecErrors,
  mergeSpec,
  specRecord,
  validateSpec,
} from "./design-spec-core";
import type { Tr } from "./i18n";
import type { ProductItemDef, ResolvedProductType } from "./product-types";

// biome-ignore lint/suspicious/noExplicitAny: same rationale as product-types.test.ts
const tr = createTranslator({ locale: "ja", messages: ja as any }) as Tr;

const def = (
  over: Partial<ProductItemDef> & { key: string },
): ProductItemDef => ({
  label: { ja: over.key, en: over.key },
  type: "string",
  required: false,
  order: 0,
  enabled: true,
  ...over,
});

const defs = [
  def({ key: "drawingNo" }),
  def({ key: "hardnessHrc", type: "number", min: 0, max: 100 }),
  def({
    key: "coatingType",
    type: "select",
    required: true,
    options: [{ value: "tin", label: "TiN" }],
  }),
];
const types: ResolvedProductType[] = [
  {
    id: "coated",
    name: { ja: "コーティング品", en: "Coated" },
    enabled: true,
    items: [defs[2]],
  },
];

describe("materialSpecErrors — 材種を入れたら直径・全長も必須", () => {
  it("材種なしなら何も求めない", () => {
    expect(
      materialSpecErrors(
        { materialTypeId: null, diameterMm: null, lengthMm: null },
        tr,
      ),
    ).toEqual({});
  });

  it("材種ありで寸法が無い・範囲外なら両方言う", () => {
    const e = materialSpecErrors(
      { materialTypeId: "3", diameterMm: null, lengthMm: 5000 },
      tr,
    );
    expect(e.diameterMm).toBeTruthy();
    expect(e.lengthMm).toBeTruthy();
  });

  it("**寸法は材種なしでも持てる**（図面から読んだ寸法を捨てない）", () => {
    expect(
      materialSpecErrors(
        { materialTypeId: null, diameterMm: 10, lengthMm: 120 },
        tr,
      ),
    ).toEqual({});
  });

  it("材種なしでも、入っている寸法は範囲を見る", () => {
    const e = materialSpecErrors(
      { materialTypeId: null, diameterMm: 500, lengthMm: null },
      tr,
    );
    expect(e.diameterMm).toBeTruthy();
    expect(e.lengthMm).toBeUndefined();
  });

  it("範囲内なら通る", () => {
    expect(
      materialSpecErrors(
        { materialTypeId: 3, diameterMm: 10, lengthMm: 120 },
        tr,
      ),
    ).toEqual({});
  });
});

describe("decomposeSpec / mergeSpec", () => {
  const spec = {
    _product_type: "coated",
    coatingType: "tin",
    drawingNo: "A-1",
    legacyKey: "old",
  };

  it("種別の項目・追加項目・定義外の旧キーに分ける", () => {
    const s = decomposeSpec(spec, types, defs);
    expect(s.typeId).toBe("coated");
    expect(s.typeValues).toEqual({ coatingType: "tin" });
    expect(s.extraKeys).toEqual(["drawingNo"]);
    expect(s.preserved).toEqual({ legacyKey: "old" });
  });

  it("**定義外の旧キーは保存しても消えない**（往復で同じになる）", () => {
    expect(mergeSpec(decomposeSpec(spec, types, defs), types)).toEqual(spec);
  });

  it("空の値は落とし、何も無ければ null", () => {
    expect(
      mergeSpec(
        {
          typeId: null,
          typeValues: {},
          extraKeys: ["drawingNo"],
          extraValues: { drawingNo: " " },
          preserved: {},
        },
        types,
      ),
    ).toBeNull();
  });

  it("存在しない種別 id は種別なしとして扱う", () => {
    expect(
      decomposeSpec({ _product_type: "gone" }, types, defs).typeId,
    ).toBeNull();
  });
});

describe("applySpecValues — 読み取った値の差し込み", () => {
  it("種別の項目ならそこへ、それ以外は追加項目へ", () => {
    const s = applySpecValues(
      decomposeSpec({ _product_type: "coated" }, types, defs),
      { coatingType: "tin", drawingNo: "072851-01" },
      types,
    );
    expect(s.typeValues.coatingType).toBe("tin");
    expect(s.extraKeys).toContain("drawingNo");
    expect(s.extraValues.drawingNo).toBe("072851-01");
  });
});

describe("validateSpec", () => {
  it("種別の必須項目が空なら言う", () => {
    expect(
      validateSpec({ _product_type: "coated" }, types, defs, tr),
    ).toBeTruthy();
  });

  it("追加項目も型で見る", () => {
    expect(validateSpec({ hardnessHrc: "abc" }, types, defs, tr)).toBeTruthy();
    expect(validateSpec({ hardnessHrc: "60" }, types, defs, tr)).toBeNull();
  });

  it("空の spec は通る", () => {
    expect(validateSpec(null, types, defs, tr)).toBeNull();
  });
});

describe("specRecord", () => {
  it("JSON 列を文字列の平らな形にする", () => {
    expect(specRecord({ a: "x", b: 3, c: null })).toEqual({ a: "x", b: "3" });
    expect(specRecord(null)).toEqual({});
    expect(specRecord([1])).toEqual({});
  });
});
