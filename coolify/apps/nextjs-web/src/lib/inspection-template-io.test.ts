import { describe, expect, it } from "vitest";
import {
  EXCEL_COLUMNS,
  PORTABLE_KIND,
  portableFileSchema,
  rowsToPortable,
} from "./inspection-template-io";

/** 見出し行 + 指定した列だけ埋めた行を作る。 */
function sheet(items: Array<Record<string, string>>): string[][] {
  const header = EXCEL_COLUMNS.map((c) => c.header);
  const rows = items.map((item) => EXCEL_COLUMNS.map((c) => item[c.key] ?? ""));
  return [header, ...rows];
}

describe("Excel → 持ち出し形式", () => {
  it("同じ検査表コードの行を 1 枚にまとめる", () => {
    const { templates, errors } = rowsToPortable(
      sheet([
        {
          code: "INS-A",
          name: "外観検査",
          itemName: "外径",
          inputType: "数値",
          unit: "mm",
          toleranceMin: "7.98",
          toleranceMax: "8.02",
        },
        {
          code: "INS-A",
          itemName: "キズ",
          inputType: "はい/いいえ",
          acceptBool: "いいえ",
        },
      ]),
    );
    expect(errors).toEqual([]);
    expect(templates).toHaveLength(1);
    expect(templates[0].name.ja).toBe("外観検査");
    expect(templates[0].items).toHaveLength(2);
    expect(templates[0].items[0]).toMatchObject({
      inputType: "NUMBER",
      unit: "mm",
      toleranceMin: 7.98,
      toleranceMax: 8.02,
    });
    expect(templates[0].items[1]).toMatchObject({
      inputType: "BOOLEAN",
      acceptBool: false,
    });
  });

  // 現場は画面と同じ日本語しか書けない。enum を書かせない
  it("日本語のラベルを enum に直す（enum を直接書いても受ける）", () => {
    const { templates } = rowsToPortable(
      sheet([
        {
          code: "A",
          name: "n",
          itemName: "i",
          inputType: "複数選択",
          samplingMode: "割合(%)",
          samplingValue: "10",
          recordStyle: "合格数のみ",
          options: "A|B|C",
          acceptOptions: "A,B",
        },
        { code: "B", name: "n", itemName: "i", inputType: "SELECT_SINGLE" },
      ]),
    );
    expect(templates[0]).toMatchObject({
      samplingMode: "PERCENT",
      samplingValue: 10,
      recordStyle: "COUNTS",
    });
    expect(templates[0].items[0]).toMatchObject({
      inputType: "SELECT_MULTI",
      acceptOptions: ["A", "B"],
    });
    expect(templates[0].items[0].options).toEqual([
      { value: "A", label: { ja: "A" } },
      { value: "B", label: { ja: "B" } },
      { value: "C", label: { ja: "C" } },
    ]);
    expect(templates[1].items[0].inputType).toBe("SELECT_SINGLE");
  });

  it("見出しは位置ではなく名前で照合する（並べ替えても壊れない）", () => {
    const rows = sheet([{ code: "A", name: "n", itemName: "i" }]);
    // 列を入れ替える
    const swapped = rows.map((r) => [r[6], ...r.slice(0, 6), ...r.slice(7)]);
    const { templates, errors } = rowsToPortable(swapped);
    expect(errors).toEqual([]);
    expect(templates[0].items[0].itemName.ja).toBe("i");
  });

  it("空行は飛ばす", () => {
    const rows = sheet([{ code: "A", name: "n", itemName: "i" }]);
    rows.splice(1, 0, []);
    rows.push(["", "", ""]);
    const { templates, errors } = rowsToPortable(rows);
    expect(errors).toEqual([]);
    expect(templates).toHaveLength(1);
  });
});

describe("読めない行は行番号つきで返す（黙って既定値で埋めない）", () => {
  it("数値でない公差", () => {
    const { errors } = rowsToPortable(
      sheet([
        { code: "A", name: "n", itemName: "i", toleranceMin: "だいたい 8" },
      ]),
    );
    // 行の誤り + 「その結果 1 項目も残らなかった」の 2 つが返る
    expect(errors[0]).toEqual({
      row: 2,
      message: "下限・上限が数値ではありません",
    });
  });

  it("項目名が空", () => {
    const { errors } = rowsToPortable(sheet([{ code: "A", name: "n" }]));
    expect(errors[0]).toMatchObject({ row: 2 });
    expect(errors[0].message).toContain("項目名");
  });

  it("最初の行に検査表名が無い", () => {
    const { errors } = rowsToPortable(sheet([{ code: "A", itemName: "i" }]));
    expect(errors[0].message).toContain("検査表名");
  });

  it("真偽で書くべき欄に別の言葉", () => {
    const { errors } = rowsToPortable(
      sheet([{ code: "A", name: "n", itemName: "i", isRequired: "たぶん" }]),
    );
    expect(errors[0].message).toContain("「はい」か「いいえ」");
  });

  // 1 行おかしいだけで全部捨てると、直す場所が分からないまま最初からになる
  it("読めた行は残し、読めない行だけ落とす", () => {
    const { templates, errors } = rowsToPortable(
      sheet([
        { code: "A", name: "n", itemName: "良い行" },
        { code: "A", itemName: "悪い行", toleranceMax: "??" },
        { code: "A", itemName: "もう 1 つ良い行" },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(templates[0].items.map((i) => i.itemName.ja)).toEqual([
      "良い行",
      "もう 1 つ良い行",
    ]);
  });

  it("見出しが違うファイルは、雛形を使うよう案内する", () => {
    const { errors } = rowsToPortable([
      ["なにか", "べつの表"],
      ["1", "2"],
    ]);
    expect(errors[0].message).toContain("雛形");
  });

  it("項目が 1 つも無い検査表は作らない", () => {
    const { templates, errors } = rowsToPortable(
      sheet([{ code: "A", name: "n", itemName: "i", toleranceMin: "x" }]),
    );
    expect(templates).toEqual([]);
    expect(
      errors.some((e) => e.message.includes("検査項目が 1 つもありません")),
    ).toBe(true);
  });
});

describe("JSON の形", () => {
  it("種別の印と版を確かめる（別のファイルを取り込ませない）", () => {
    const ok = portableFileSchema.safeParse({
      kind: PORTABLE_KIND,
      version: 1,
      templates: [
        {
          code: "A",
          name: { ja: "n" },
          items: [{ itemName: { ja: "i" }, inputType: "NUMBER" }],
        },
      ],
    });
    expect(ok.success).toBe(true);
    expect(
      portableFileSchema.safeParse({
        kind: "something.else",
        version: 1,
        templates: [],
      }).success,
    ).toBe(false);
    expect(
      portableFileSchema.safeParse({
        kind: PORTABLE_KIND,
        version: 99,
        templates: [],
      }).success,
    ).toBe(false);
  });

  it("省いた項目は既定で埋まる（往復で形が変わらない）", () => {
    const parsed = portableFileSchema.parse({
      kind: PORTABLE_KIND,
      version: 1,
      templates: [
        {
          code: "A",
          name: { ja: "n" },
          items: [{ itemName: { ja: "i" }, inputType: "NUMBER" }],
        },
      ],
    });
    expect(parsed.templates[0]).toMatchObject({
      samplingMode: "ALL",
      recordStyle: "VALUES",
      isActive: true,
      relatedProcessStepCode: null,
    });
    expect(parsed.templates[0].items[0]).toMatchObject({
      isRequired: true,
      allowManualOverride: true,
      unit: null,
    });
  });
});
