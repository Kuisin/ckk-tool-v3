/**
 * step-defects.test.ts — 完了時の不良リストの純ロジック検証。
 * キオスク（nextjs-kiosk/src/lib/steps-core.test.ts）と同じ規則を保証する。
 */

import { describe, expect, it } from "vitest";
import {
  checkDefectList,
  cleanReasonEntries,
  type DefectReasonEntry,
  defectListTotal,
  deriveSuccessFromList,
  dispositionTotals,
  isReasonEntryComplete,
  isReasonEntryCountable,
  quantitiesFromList,
} from "./step-defects";

describe("不良リスト（{種別, 種類, 詳細, 数}）", () => {
  const list: DefectReasonEntry[] = [
    { type: "SEMI", defectTypeId: 1, reason: "寸法不良", count: 3 },
    { type: "SCRAP", defectTypeId: 2, reason: "キズ", count: 2 },
    { type: "SCRAP", defectTypeId: null, reason: "", count: 1 },
    { type: "REWORK", defectTypeId: 3, reason: "バリ", count: 4 },
  ];

  it("dispositionTotals: 種別ごとに合計（入力途中の行も数える）", () => {
    expect(dispositionTotals(list)).toEqual({ semi: 3, scrap: 3, rework: 4 });
  });

  it("defectListTotal / deriveSuccessFromList", () => {
    expect(defectListTotal(list)).toBe(10);
    expect(deriveSuccessFromList(100, list)).toBe(90);
    expect(
      deriveSuccessFromList(5, [
        { type: "SCRAP", defectTypeId: 1, reason: "x", count: 20 },
      ]),
    ).toBe(0);
  });

  it("quantitiesFromList: 区分列 + 導出良品を組み立てる", () => {
    expect(quantitiesFromList(100, list)).toEqual({
      inputQuantity: 100,
      outputSuccessQuantity: 90,
      outputDefectSemiFinished: 3,
      outputDefectScrap: 3,
      outputDefectRework: 4,
    });
  });

  it("isReasonEntryComplete: 種別 + 数≥1 + 種類 FK + 詳細が必須", () => {
    const base: DefectReasonEntry = {
      type: "SCRAP",
      defectTypeId: 1,
      reason: "キズ",
      count: 2,
    };
    expect(isReasonEntryComplete(base)).toBe(true);
    expect(isReasonEntryComplete({ ...base, defectTypeId: null })).toBe(false);
    expect(isReasonEntryComplete({ ...base, reason: "  " })).toBe(false);
    expect(isReasonEntryComplete({ ...base, count: 0 })).toBe(false);
  });

  it("isReasonEntryCountable: 種別 + 数≥1 だけで集計対象", () => {
    expect(
      isReasonEntryCountable({
        type: "SCRAP",
        defectTypeId: null,
        reason: "",
        count: 2,
      }),
    ).toBe(true);
    expect(
      isReasonEntryCountable({
        type: "SCRAP",
        defectTypeId: 1,
        reason: "x",
        count: 0,
      }),
    ).toBe(false);
  });

  it("cleanReasonEntries: 集計対象行のみ・reason をトリム・種類を保持", () => {
    expect(
      cleanReasonEntries([
        { type: "SEMI", defectTypeId: 5, reason: " 寸法不良 ", count: 2 },
        { type: "SCRAP", defectTypeId: 1, reason: "x", count: 0 },
      ]),
    ).toEqual([
      { type: "SEMI", defectTypeId: 5, reason: "寸法不良", count: 2 },
    ]);
  });
});

describe("checkDefectList", () => {
  const scrap = (count: number): DefectReasonEntry[] => [
    { type: "SCRAP", defectTypeId: 1, reason: "キズ", count },
  ];

  it("NONE は常に問題なし", () => {
    expect(checkDefectList(scrap(3), 100, "NONE")).toBeNull();
  });

  it("不良が受入以内なら null", () => {
    expect(checkDefectList([], 100, "FLOW")).toBeNull();
    expect(checkDefectList(scrap(100), 100, "FLOW")).toBeNull();
  });

  it("不良が受入を超えれば OVER_INPUT", () => {
    expect(checkDefectList(scrap(101), 100, "FLOW")).toEqual({
      kind: "OVER_INPUT",
      sum: 101,
      input: 100,
    });
  });

  it("種類 FK か詳細が欠けた集計対象行は INCOMPLETE", () => {
    expect(
      checkDefectList(
        [{ type: "SCRAP", defectTypeId: null, reason: "キズ", count: 2 }],
        100,
        "FLOW",
      ),
    ).toEqual({ kind: "INCOMPLETE" });
    expect(
      checkDefectList(
        [{ type: "SCRAP", defectTypeId: 1, reason: "", count: 2 }],
        100,
        "FLOW",
      ),
    ).toEqual({ kind: "INCOMPLETE" });
  });

  it("負値 / NaN は NEGATIVE", () => {
    expect(checkDefectList(scrap(-1), 100, "FLOW")).toEqual({
      kind: "NEGATIVE",
    });
    expect(checkDefectList(scrap(Number.NaN), 100, "FLOW")).toEqual({
      kind: "NEGATIVE",
    });
  });
});
