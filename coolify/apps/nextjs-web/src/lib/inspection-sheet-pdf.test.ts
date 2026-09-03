import { describe, expect, it } from "vitest";
import {
  blankValueColumns,
  countsTableHtml,
  dimensionalGridHtml,
  equipmentLegendNote,
  filledValueColumns,
  finalInspectionSectionHtml,
  shapeSectionHtml,
} from "./inspection-sheet-pdf";

function numberItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    inputType: "NUMBER" as const,
    unit: "mm",
    toleranceMin: 7.9,
    toleranceMax: 8.1,
    options: null,
    acceptBool: null,
    acceptOptions: null,
    goalValue: 8,
    allowManualOverride: true,
    isRequired: true,
    itemName: { ja: "外径" },
    section: "MEASUREMENT" as const,
    department: null,
    measurementEquipment: "LE",
    nominalValue: 8.1,
    toleranceTopDelta: 0.05,
    toleranceBottomDelta: -0.15,
    ...over,
  };
}

describe("equipmentLegendNote", () => {
  it("使われているコードだけを凡例にする", () => {
    const note = equipmentLegendNote([
      numberItem({ measurementEquipment: "LE" }),
      numberItem({ id: 2, measurementEquipment: "PR" }),
    ]);
    expect(note).toContain("LE=レーザー");
    expect(note).toContain("PR=投影機");
    expect(note).not.toContain("K=顕微鏡");
  });

  it("コード未設定なら空文字", () => {
    expect(
      equipmentLegendNote([numberItem({ measurementEquipment: null })]),
    ).toBe("");
  });
});

describe("dimensionalGridHtml", () => {
  it("項目が無ければ空文字", () => {
    expect(dimensionalGridHtml([], [])).toBe("");
  });

  it("基本値・目標値・公差Top/Bottom・上限下限の行を持つ", () => {
    const html = dimensionalGridHtml(
      [numberItem()],
      [{ label: "製品 1", cellByItemId: { 1: "8.02" } }],
    );
    expect(html).toContain("基本値");
    expect(html).toContain("目標値");
    expect(html).toContain("公差 Top");
    expect(html).toContain("公差 Bottom");
    expect(html).toContain("上限");
    expect(html).toContain("下限");
    expect(html).toContain("製品 1");
    expect(html).toContain("8.02");
    // measurementEquipment がヘッダに接尾辞として出る
    expect(html).toContain("(LE)");
  });

  it("NUMBER 以外は基本値/公差の行が「—」になる", () => {
    const boolItem = numberItem({
      inputType: "BOOLEAN" as const,
      acceptBool: true,
      nominalValue: null,
      toleranceTopDelta: null,
      toleranceBottomDelta: null,
    });
    const html = dimensionalGridHtml([boolItem], []);
    expect(html).toContain("—");
  });

  it("HTML エスケープされる（項目名にタグを入れても実行されない）", () => {
    const html = dimensionalGridHtml(
      [numberItem({ itemName: { ja: "<script>x</script>" } })],
      [],
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("blankValueColumns / filledValueColumns", () => {
  it("blank: 要求サンプル数ぶんの空欄列を作る", () => {
    const { columns, overflowNote } = blankValueColumns(
      [numberItem()],
      { samplingMode: "COUNT", samplingValue: 3 },
      null,
      "GENERIC",
    );
    expect(columns).toHaveLength(3);
    expect(columns[0].label).toBe("製品 1");
    expect(overflowNote).toBe("");
  });

  it("blank: 上限を超える要求数は overflowNote に出す", () => {
    const { columns, overflowNote } = blankValueColumns(
      [numberItem()],
      { samplingMode: "COUNT", samplingValue: 25 },
      null,
      "GENERIC",
    );
    expect(columns).toHaveLength(10);
    expect(overflowNote).toContain("25");
  });

  it("blank: INITIAL_MID_FINAL のサンプル呼称を使う", () => {
    const { columns } = blankValueColumns(
      [numberItem()],
      { samplingMode: "COUNT", samplingValue: 3 },
      null,
      "INITIAL_MID_FINAL",
    );
    expect(columns.map((c) => c.label)).toEqual(["初品", "中間品", "最終品"]);
  });

  it("filled: 記録済みサンプル数ぶんの列を作り、実測値を表示する", () => {
    const item = numberItem();
    const columns = filledValueColumns(
      [
        {
          templateItem: item,
          measuredValue: null,
          measuredValues: ["8.0", "8.05"],
        },
      ],
      [item],
      "GENERIC",
    );
    expect(columns).toHaveLength(2);
    expect(columns[0].cellByItemId[1]).toContain("8");
  });
});

describe("shapeSectionHtml", () => {
  it("SHAPE 区分の項目が無ければ空文字", () => {
    expect(shapeSectionHtml([numberItem()])).toBe("");
  });

  it("空欄シートは10行になるよう空行を補う", () => {
    const shapeItem = numberItem({
      id: 2,
      section: "SHAPE" as const,
      inputType: "TEXT" as const,
    });
    const html = shapeSectionHtml([shapeItem]);
    const rowCount = (html.match(/<tr>/g) ?? []).length;
    expect(rowCount).toBe(10);
  });

  it("記入済みシートは実項目数のまま（空行を補わない）", () => {
    const shapeItem = numberItem({
      id: 2,
      section: "SHAPE" as const,
      inputType: "TEXT" as const,
    });
    const html = shapeSectionHtml([shapeItem], new Map([[2, "OK"]]));
    const rowCount = (html.match(/<tr>/g) ?? []).length;
    expect(rowCount).toBe(1);
    expect(html).toContain("OK");
  });
});

describe("countsTableHtml", () => {
  it("行が無ければ空文字", () => {
    expect(countsTableHtml([])).toBe("");
  });
});

describe("finalInspectionSectionHtml", () => {
  it("null（マスタ印刷・未操作）は空文字", () => {
    expect(finalInspectionSectionHtml(null)).toBe("");
  });

  it("設定済みフィールドはスタンプを表示する", () => {
    const html = finalInspectionSectionHtml({
      drawingLabelOk: true,
      drawingLabelChecked: "山田太郎（2026/09/01 10:00）",
      protectiveCapOk: null,
      protectiveCapChecked: null,
      finishedQuantityOk: null,
      finishedQuantityChecked: null,
      spareStockUsed: true,
      spareStockReceived: false,
      shelved: null,
      deliveryNoteIssued: null,
      shipmentAuthorized: null,
      shipDefectReviewed: null,
      shipDefectNotes: null,
    });
    expect(html).toContain("山田太郎");
    expect(html).toContain("予備在庫使用: 有");
    expect(html).toContain("予備在庫入庫: 無");
  });
});
