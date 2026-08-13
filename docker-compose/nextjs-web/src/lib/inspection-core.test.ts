/**
 * inspection-core.test.ts — 検査表純ロジックの単体テスト。
 * twin file: nextjs-kiosk 側は逐語コピー（twin-files.test.ts がドリフト検出）。
 */

import { describe, expect, it } from "vitest";
import {
  acceptLabel,
  evaluateItem,
  evaluateSample,
  formatSampleValue,
  goalLabel,
  type InspectionItemSpec,
  isSampleEmpty,
  missingRequiredEntries,
  parseSelectOptions,
  parseStoredSamples,
  requiredSampleCount,
  samplingLabelJa,
} from "./inspection-core";

function spec(over: Partial<InspectionItemSpec> = {}): InspectionItemSpec {
  return {
    id: 1,
    inputType: "NUMBER",
    unit: "mm",
    toleranceMin: 7.9,
    toleranceMax: 8.1,
    options: [],
    acceptBool: null,
    acceptOptions: null,
    goalValue: null,
    samplingMode: "ALL",
    samplingValue: null,
    isRequired: true,
    ...over,
  };
}

const selectSpec = (over: Partial<InspectionItemSpec> = {}) =>
  spec({
    inputType: "SELECT_SINGLE",
    unit: null,
    toleranceMin: null,
    toleranceMax: null,
    options: [
      { value: "ok", label: { ja: "良好", en: "OK" } },
      { value: "minor", label: { ja: "軽微", en: "Minor" } },
      { value: "bad", label: { ja: "不良", en: "Bad" } },
    ],
    acceptOptions: ["ok", "minor"],
    ...over,
  });

describe("evaluateSample", () => {
  it("NUMBER: 範囲内 = 合格、範囲外 = 不合格", () => {
    expect(evaluateSample(spec(), "8.0")).toBe(true);
    expect(evaluateSample(spec(), "7.9")).toBe(true); // 境界含む
    expect(evaluateSample(spec(), "8.2")).toBe(false);
    expect(evaluateSample(spec(), "7.5")).toBe(false);
  });

  it("NUMBER: 片側のみの範囲", () => {
    const minOnly = spec({ toleranceMax: null });
    expect(evaluateSample(minOnly, "100")).toBe(true);
    expect(evaluateSample(minOnly, "7")).toBe(false);
    const maxOnly = spec({ toleranceMin: null });
    expect(evaluateSample(maxOnly, "8.1")).toBe(true);
    expect(evaluateSample(maxOnly, "8.2")).toBe(false);
  });

  it("NUMBER: 基準未設定・パース不能・未入力は null", () => {
    expect(
      evaluateSample(spec({ toleranceMin: null, toleranceMax: null }), "8.0"),
    ).toBeNull();
    expect(evaluateSample(spec(), "abc")).toBeNull();
    expect(evaluateSample(spec(), "  ")).toBeNull();
  });

  it("BOOLEAN: acceptBool と一致で合格", () => {
    const yes = spec({ inputType: "BOOLEAN", acceptBool: true });
    expect(evaluateSample(yes, "true")).toBe(true);
    expect(evaluateSample(yes, "false")).toBe(false);
    const no = spec({ inputType: "BOOLEAN", acceptBool: false });
    expect(evaluateSample(no, "false")).toBe(true);
    expect(evaluateSample(no, "true")).toBe(false);
    expect(
      evaluateSample(spec({ inputType: "BOOLEAN", acceptBool: null }), "true"),
    ).toBeNull();
  });

  it("SELECT_SINGLE: acceptOptions 包含で合格", () => {
    expect(evaluateSample(selectSpec(), "ok")).toBe(true);
    expect(evaluateSample(selectSpec(), "minor")).toBe(true);
    expect(evaluateSample(selectSpec(), "bad")).toBe(false);
    expect(
      evaluateSample(selectSpec({ acceptOptions: null }), "ok"),
    ).toBeNull();
  });

  it("SELECT_MULTI: 選択全部が acceptOptions 内で合格", () => {
    const multi = selectSpec({ inputType: "SELECT_MULTI" });
    expect(evaluateSample(multi, ["ok", "minor"])).toBe(true);
    expect(evaluateSample(multi, ["ok", "bad"])).toBe(false);
    expect(evaluateSample(multi, [])).toBeNull(); // 未入力
  });
});

describe("evaluateItem", () => {
  it("全サンプル合格 = true / 1 つでも不合格 = false", () => {
    expect(evaluateItem(spec(), ["8.0", "7.95", "8.1"])).toBe(true);
    expect(evaluateItem(spec(), ["8.0", "8.5"])).toBe(false);
  });

  it("未入力のみ・判定不能を含むときは null", () => {
    expect(evaluateItem(spec(), ["", ""])).toBeNull();
    expect(evaluateItem(spec(), ["8.0", "abc"])).toBeNull(); // 合格 + 判定不能
    // 判定不能があっても不合格は確定
    expect(evaluateItem(spec(), ["abc", "9.0"])).toBe(false);
  });

  it("空サンプルは無視して判定", () => {
    expect(evaluateItem(spec(), ["8.0", ""])).toBe(true);
  });
});

describe("requiredSampleCount", () => {
  it("ALL はロット数量（不明なら null）", () => {
    expect(requiredSampleCount(spec(), 100)).toBe(100);
    expect(requiredSampleCount(spec(), null)).toBeNull();
  });

  it("PERCENT は切り上げ・最低 1・ロット上限", () => {
    const p10 = spec({ samplingMode: "PERCENT", samplingValue: 10 });
    expect(requiredSampleCount(p10, 100)).toBe(10);
    expect(requiredSampleCount(p10, 15)).toBe(2); // 1.5 → 2
    expect(requiredSampleCount(p10, 3)).toBe(1); // 0.3 → 最低 1
    expect(
      requiredSampleCount(
        spec({ samplingMode: "PERCENT", samplingValue: 200 }),
        10,
      ),
    ).toBe(10); // ロット上限
    expect(requiredSampleCount(p10, null)).toBeNull();
  });

  it("COUNT は指定本数・ロット上限（ロット不明でも本数を返す）", () => {
    const c5 = spec({ samplingMode: "COUNT", samplingValue: 5 });
    expect(requiredSampleCount(c5, 100)).toBe(5);
    expect(requiredSampleCount(c5, 3)).toBe(3);
    expect(requiredSampleCount(c5, null)).toBe(5);
  });
});

describe("missingRequiredEntries", () => {
  const items = [
    { id: 1, isRequired: true },
    { id: 2, isRequired: false },
    { id: 3, isRequired: true },
  ];
  it("必須で全サンプル未入力の id を返す", () => {
    expect(
      missingRequiredEntries(items, { 1: ["8.0"], 3: ["", "  "] }),
    ).toEqual([3]);
    expect(missingRequiredEntries(items, {})).toEqual([1, 3]);
    expect(missingRequiredEntries(items, { 1: [["a"]], 3: [[]] })).toEqual([3]);
  });
});

describe("labels & formatting", () => {
  it("acceptLabel: 型別の合格基準表示", () => {
    expect(acceptLabel(spec())).toBe("7.9 〜 8.1 mm");
    expect(acceptLabel(spec({ toleranceMax: null }))).toBe("7.9 以上 mm");
    expect(acceptLabel(spec({ inputType: "BOOLEAN", acceptBool: true }))).toBe(
      "はい",
    );
    expect(acceptLabel(selectSpec())).toBe("良好・軽微");
    expect(acceptLabel(selectSpec(), "en")).toBe("OK・Minor");
    expect(acceptLabel(selectSpec({ acceptOptions: [] }))).toBeNull();
  });

  it("goalLabel: 型別の目標表示", () => {
    expect(goalLabel(spec({ goalValue: 8 }))).toBe("8 mm");
    expect(goalLabel(spec({ inputType: "BOOLEAN", goalValue: false }))).toBe(
      "いいえ",
    );
    expect(goalLabel(selectSpec({ goalValue: "ok" }))).toBe("良好");
    expect(
      goalLabel(
        selectSpec({ inputType: "SELECT_MULTI", goalValue: ["ok", "minor"] }),
      ),
    ).toBe("良好・軽微");
    expect(goalLabel(spec())).toBeNull();
  });

  it("formatSampleValue: 型別の実測値表示", () => {
    expect(formatSampleValue(spec(), "8.02")).toBe("8.02 mm");
    expect(formatSampleValue(spec({ inputType: "BOOLEAN" }), "true")).toBe(
      "はい",
    );
    expect(formatSampleValue(selectSpec(), "ok")).toBe("良好");
    expect(
      formatSampleValue(selectSpec({ inputType: "SELECT_MULTI" }), [
        "ok",
        "bad",
      ]),
    ).toBe("良好・不良");
    expect(formatSampleValue(spec(), "")).toBe("—");
  });

  it("samplingLabelJa", () => {
    expect(samplingLabelJa(spec())).toBe("全数");
    expect(
      samplingLabelJa(spec({ samplingMode: "PERCENT", samplingValue: 10 }), 5),
    ).toBe("抜取 10%（5本）");
    expect(
      samplingLabelJa(spec({ samplingMode: "COUNT", samplingValue: 5 })),
    ).toBe("抜取 5本");
  });
});

describe("parsers", () => {
  it("parseSelectOptions: 不正要素を捨てる", () => {
    expect(
      parseSelectOptions([
        { value: "a", label: { ja: "A" } },
        { value: "", label: {} },
        "junk",
        { label: { ja: "no value" } },
        { value: "b", label: { ja: "B", en: "B!" } },
      ]),
    ).toEqual([
      { value: "a", label: { ja: "A" } },
      { value: "b", label: { ja: "B", en: "B!" } },
    ]);
    expect(parseSelectOptions(null)).toEqual([]);
  });

  it("parseStoredSamples: string / string[] のみ通す", () => {
    expect(parseStoredSamples(["8.0", ["a", "b"], 1, { x: 1 }])).toEqual([
      "8.0",
      ["a", "b"],
    ]);
    expect(parseStoredSamples(null)).toEqual([]);
  });

  it("isSampleEmpty", () => {
    expect(isSampleEmpty("")).toBe(true);
    expect(isSampleEmpty("  ")).toBe(true);
    expect(isSampleEmpty([])).toBe(true);
    expect(isSampleEmpty("x")).toBe(false);
    expect(isSampleEmpty(["x"])).toBe(false);
  });
});
