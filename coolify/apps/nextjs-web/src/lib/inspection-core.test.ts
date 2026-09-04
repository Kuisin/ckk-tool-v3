/**
 * inspection-core.test.ts — 検査表純ロジックの単体テスト。
 * twin file: nextjs-kiosk 側は逐語コピー（twin-files.test.ts がドリフト検出）。
 */

import { describe, expect, it } from "vitest";
import {
  acceptLabel,
  entriesBlockingSave,
  evaluateCounts,
  evaluateItem,
  evaluateSample,
  formatCounts,
  formatSampleValue,
  goalLabel,
  hasAcceptCriteria,
  type InspectionItemEntryData,
  type InspectionItemSpec,
  isEntryStarted,
  isSampleEmpty,
  missingInspectionSheets,
  missingRequiredEntries,
  parseSelectOptions,
  parseStoredSamples,
  requiredSampleCount,
  resolveItemPass,
  sampleLabel,
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
    allowManualOverride: true,
    isRequired: true,
    ...over,
  };
}

/** シート単位の検査対象 spec 短縮形。 */
const sampling = (
  samplingMode: "ALL" | "PERCENT" | "COUNT",
  samplingValue: number | null = null,
) => ({ samplingMode, samplingValue });

/** VALUES エントリの短縮形。 */
const entry = (
  samples: (string | string[])[],
): {
  samples: (string | string[])[];
  inspectedCount: null;
  passedCount: null;
} => ({ samples, inspectedCount: null, passedCount: null });

/** COUNTS エントリの短縮形。 */
const counts = (
  inspected: number | null,
  passed: number | null,
): {
  samples: [];
  inspectedCount: number | null;
  passedCount: number | null;
} => ({ samples: [], inspectedCount: inspected, passedCount: passed });

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

  it("TEXT: 基準を持たない — 常に手動判定", () => {
    const text = spec({
      inputType: "TEXT",
      unit: null,
      toleranceMin: null,
      toleranceMax: null,
    });
    expect(evaluateSample(text, "形状OK")).toBeNull();
    expect(evaluateSample(text, "")).toBeNull();
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
    expect(requiredSampleCount(sampling("ALL"), 100)).toBe(100);
    expect(requiredSampleCount(sampling("ALL"), null)).toBeNull();
  });

  it("PERCENT は切り上げ・最低 1・ロット上限", () => {
    const p10 = sampling("PERCENT", 10);
    expect(requiredSampleCount(p10, 100)).toBe(10);
    expect(requiredSampleCount(p10, 15)).toBe(2); // 1.5 → 2
    expect(requiredSampleCount(p10, 3)).toBe(1); // 0.3 → 最低 1
    expect(requiredSampleCount(sampling("PERCENT", 200), 10)).toBe(10); // ロット上限
    expect(requiredSampleCount(p10, null)).toBeNull();
  });

  it("COUNT は指定本数・ロット上限（ロット不明でも本数を返す）", () => {
    const c5 = sampling("COUNT", 5);
    expect(requiredSampleCount(c5, 100)).toBe(5);
    expect(requiredSampleCount(c5, 3)).toBe(3);
    expect(requiredSampleCount(c5, null)).toBe(5);
  });
});

describe("resolveItemPass / hasAcceptCriteria", () => {
  it("上書き許可: 手動 > 自動 > 既定合格", () => {
    expect(resolveItemPass(spec(), entry(["9.0"]), true, "VALUES")).toBe(true); // 自動不合格を手動で上書き
    expect(resolveItemPass(spec(), entry(["8.0"]), false, "VALUES")).toBe(
      false,
    ); // 自動合格を手動で上書き
    expect(resolveItemPass(spec(), entry(["8.0"]), null, "VALUES")).toBe(true); // 自動判定に従う
    expect(resolveItemPass(spec(), entry([""]), null, "VALUES")).toBe(true); // 未入力は既定合格
  });

  it("上書き不可: 自動判定が出れば手動を無視", () => {
    const locked = spec({ allowManualOverride: false });
    expect(resolveItemPass(locked, entry(["9.0"]), true, "VALUES")).toBe(false);
    expect(resolveItemPass(locked, entry(["8.0"]), false, "VALUES")).toBe(true);
    // 自動判定が出ない（未入力）ときは手動にフォールバック
    expect(resolveItemPass(locked, entry([""]), false, "VALUES")).toBe(false);
  });

  it("COUNTS: 全数合格で合格・検査数未入力は判定不能", () => {
    expect(evaluateCounts(5, 5)).toBe(true);
    expect(evaluateCounts(5, 4)).toBe(false);
    expect(evaluateCounts(null, 4)).toBeNull();
    expect(evaluateCounts(0, 0)).toBeNull();
    expect(resolveItemPass(spec(), counts(5, 4), null, "COUNTS")).toBe(false);
    expect(resolveItemPass(spec(), counts(5, 4), true, "COUNTS")).toBe(true); // 上書き
    expect(
      resolveItemPass(
        spec({ allowManualOverride: false }),
        counts(5, 4),
        true,
        "COUNTS",
      ),
    ).toBe(false); // 上書き不可
  });

  it("isEntryStarted: 記録方式ごとの入力開始判定", () => {
    expect(isEntryStarted(entry(["", ""]), "VALUES")).toBe(false);
    expect(isEntryStarted(entry(["8.0"]), "VALUES")).toBe(true);
    expect(isEntryStarted(counts(null, null), "COUNTS")).toBe(false);
    expect(isEntryStarted(counts(5, null), "COUNTS")).toBe(true);
  });

  it("formatCounts", () => {
    expect(formatCounts(5, 4)).toBe("合格 4/5");
    expect(formatCounts(null, null)).toBe("合格 —/—");
    expect(formatCounts(5, 5, "Pass")).toBe("Pass 5/5");
  });

  it("hasAcceptCriteria: 型別の基準有無", () => {
    expect(hasAcceptCriteria(spec())).toBe(true);
    expect(
      hasAcceptCriteria(spec({ toleranceMin: null, toleranceMax: null })),
    ).toBe(false);
    expect(
      hasAcceptCriteria(spec({ inputType: "BOOLEAN", acceptBool: true })),
    ).toBe(true);
    expect(
      hasAcceptCriteria(spec({ inputType: "BOOLEAN", acceptBool: null })),
    ).toBe(false);
    expect(hasAcceptCriteria(selectSpec())).toBe(true);
    expect(hasAcceptCriteria(selectSpec({ acceptOptions: [] }))).toBe(false);
    expect(hasAcceptCriteria(spec({ inputType: "TEXT" }))).toBe(false);
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

describe("entriesBlockingSave", () => {
  const items = [
    { id: 1, isRequired: true, allowManualOverride: true },
    { id: 2, isRequired: false, allowManualOverride: true },
    { id: 3, isRequired: false, allowManualOverride: false },
  ];
  const entries = (
    map: Record<number, InspectionItemEntryData | undefined>,
  ) => {
    return (id: number) => map[id];
  };
  const filled = { samples: ["8.0"], inspectedCount: null, passedCount: null };
  const blank = {
    samples: ["", "  "],
    inspectedCount: null,
    passedCount: null,
  };

  it("必須で未入力の項目を返す（任意で上書き可は空でもよい）", () => {
    expect(
      entriesBlockingSave(items, entries({ 1: blank, 3: filled }), "VALUES"),
    ).toEqual([1]);
    expect(
      entriesBlockingSave(items, entries({ 1: filled, 3: filled }), "VALUES"),
    ).toEqual([]);
  });

  it("手動上書き不可の項目は任意でも入力が無いと保存できない", () => {
    expect(
      entriesBlockingSave(items, entries({ 1: filled, 3: blank }), "VALUES"),
    ).toEqual([3]);
  });

  it("エントリが送られてこない項目は未入力とみなす", () => {
    expect(entriesBlockingSave(items, entries({}), "VALUES")).toEqual([1, 3]);
  });

  it("COUNTS は検査数・合格数のどちらかが入っていれば入力あり", () => {
    const counts = { samples: [], inspectedCount: 5, passedCount: null };
    expect(
      entriesBlockingSave(items, entries({ 1: counts, 3: blank }), "COUNTS"),
    ).toEqual([3]);
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

  it("acceptLabel: BoolLabels で範囲の言い回し・区切りを差し替えられる（画面側の言語対応）", () => {
    const en = {
      yes: "Yes",
      no: "No",
      rangeBetween: (min: string, max: string) => `${min} to ${max}`,
      rangeAtLeast: (min: string) => `${min} or more`,
      rangeAtMost: (max: string) => `${max} or less`,
      listSeparator: ", ",
    };
    expect(acceptLabel(spec(), "en", en)).toBe("7.9 to 8.1 mm");
    expect(acceptLabel(spec({ toleranceMax: null }), "en", en)).toBe(
      "7.9 or more mm",
    );
    expect(acceptLabel(spec({ toleranceMin: null }), "en", en)).toBe(
      "8.1 or less mm",
    );
    expect(acceptLabel(selectSpec(), "en", en)).toBe("OK, Minor");
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
    expect(samplingLabelJa(sampling("ALL"))).toBe("全数");
    expect(samplingLabelJa(sampling("ALL"), 50)).toBe("全数（50本）");
    expect(samplingLabelJa(sampling("PERCENT", 10), 5)).toBe("抜取 10%（5本）");
    expect(samplingLabelJa(sampling("COUNT", 5))).toBe("抜取 5本");
  });

  it("formatSampleValue: TEXT はそのまま表示", () => {
    const text = spec({ inputType: "TEXT", unit: null });
    expect(formatSampleValue(text, "形状OK")).toBe("形状OK");
    expect(formatSampleValue(text, "")).toBe("—");
  });

  it("sampleLabel: GENERIC は製品N、INITIAL_MID_FINAL は先頭3件だけ差し替え", () => {
    expect(sampleLabel(0, "GENERIC")).toBe("製品 1");
    expect(sampleLabel(3, "GENERIC")).toBe("製品 4");
    expect(sampleLabel(0, "INITIAL_MID_FINAL")).toBe("初品");
    expect(sampleLabel(1, "INITIAL_MID_FINAL")).toBe("中間品");
    expect(sampleLabel(2, "INITIAL_MID_FINAL")).toBe("最終品");
    expect(sampleLabel(3, "INITIAL_MID_FINAL")).toBe("製品 4");
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

describe("missingInspectionSheets", () => {
  const A = { id: 1, name: "円筒検査" };
  const B = { id: 2, name: "外観検査" };

  it("割当が無ければ何も要求しない（検査工程でない工程を止めない）", () => {
    expect(missingInspectionSheets([], [])).toEqual([]);
  });

  it("記録が 1 件も無ければ全部返す", () => {
    expect(missingInspectionSheets([A, B], [])).toEqual([A, B]);
  });

  it("記録のある検査表は外す", () => {
    expect(missingInspectionSheets([A, B], [{ templateId: 1 }])).toEqual([B]);
  });

  it("同じ検査表の記録が何件あっても 1 件以上なら足りている", () => {
    expect(
      missingInspectionSheets([A], [{ templateId: 1 }, { templateId: 1 }]),
    ).toEqual([]);
  });

  it("割り当てられていない検査表の記録は数に入れない", () => {
    expect(missingInspectionSheets([A], [{ templateId: 99 }])).toEqual([A]);
  });
});
