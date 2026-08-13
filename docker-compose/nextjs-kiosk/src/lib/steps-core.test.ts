/**
 * steps-core.test.ts — 工程実行アプリの純ロジック。
 *
 * とくに一時停止の導出（PAUSED = IN_PROGRESS かつ lock なし）と累計作業時間は
 * この機能の設計そのものなので、真理値表で固定する。
 */

import { describe, expect, it } from "vitest";
import {
  accumulatedWorkMs,
  availableActions,
  bucketOf,
  checkDefectList,
  cleanReasonEntries,
  compareSteps,
  type DefectReasonEntry,
  defectListTotal,
  deriveSuccessFromList,
  dispositionTotals,
  formatElapsed,
  inspectionOutcome,
  isDefectEntryComplete,
  isReasonEntryComplete,
  missingRequiredItems,
  quantitiesFromList,
  quantityFormDefaults,
  type SortableStep,
  type StepSessionState,
  stepSessionState,
} from "./steps-core";
import type { StepState, WorkflowCtx } from "./workflow-core";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const step = (over: Partial<StepState> & { id: string }): StepState => ({
  processStepId: 1,
  status: "PENDING",
  sortOrder: 0,
  inputQuantity: null,
  outputSuccess: null,
  defectSemiFinished: null,
  defectScrap: null,
  defectRework: null,
  sessionLockedBy: null,
  ...over,
});

const ctxOf = (steps: StepState[]): WorkflowCtx => ({
  plannedQuantity: 100,
  steps,
  links: [],
  execDeps: [],
});

describe("stepSessionState", () => {
  it("進行中 + 自分のロック = WORKING", () => {
    const s = step({ id: "a", status: "IN_PROGRESS", sessionLockedBy: ME });
    expect(stepSessionState(s, ctxOf([s]), ME)).toBe<StepSessionState>(
      "WORKING",
    );
  });

  it("進行中 + ロックなし = PAUSED（STEP_STATUS に PAUSED を足さない設計）", () => {
    const s = step({ id: "a", status: "IN_PROGRESS", sessionLockedBy: null });
    expect(stepSessionState(s, ctxOf([s]), ME)).toBe<StepSessionState>(
      "PAUSED",
    );
  });

  it("進行中 + 他人のロック = OTHER", () => {
    const s = step({ id: "a", status: "IN_PROGRESS", sessionLockedBy: OTHER });
    expect(stepSessionState(s, ctxOf([s]), ME)).toBe<StepSessionState>("OTHER");
  });

  it("未着手・依存なし = STARTABLE", () => {
    const s = step({ id: "a" });
    expect(stepSessionState(s, ctxOf([s]), ME)).toBe<StepSessionState>(
      "STARTABLE",
    );
  });

  it("未着手・分岐元が未完了 = BLOCKED", () => {
    const src = step({ id: "src", status: "IN_PROGRESS" });
    const tgt = step({ id: "tgt", sortOrder: 1 });
    const ctx: WorkflowCtx = {
      ...ctxOf([src, tgt]),
      links: [{ sourceStepId: "src", targetStepId: "tgt", routedQuantity: 10 }],
    };
    expect(stepSessionState(tgt, ctx, ME)).toBe<StepSessionState>("BLOCKED");
  });

  it("完了・キャンセルはそのまま", () => {
    const c = step({ id: "a", status: "COMPLETED" });
    const x = step({ id: "b", status: "CANCELLED" });
    expect(stepSessionState(c, ctxOf([c, x]), ME)).toBe("COMPLETED");
    expect(stepSessionState(x, ctxOf([c, x]), ME)).toBe("CANCELLED");
  });
});

describe("availableActions", () => {
  it("状態ごとに押せる操作だけを返す", () => {
    expect(availableActions("STARTABLE")).toEqual(["START"]);
    expect(availableActions("WORKING")).toEqual(["PAUSE", "COMPLETE"]);
    expect(availableActions("PAUSED")).toEqual(["RESUME", "COMPLETE"]);
    expect(availableActions("BLOCKED")).toEqual([]);
    expect(availableActions("OTHER")).toEqual([]);
    expect(availableActions("COMPLETED")).toEqual([]);
  });
});

describe("accumulatedWorkMs", () => {
  const t = (iso: string) => new Date(iso);
  const now = t("2026-08-14T05:00:00Z");

  it("閉じた作業セッションは endedAt まで", () => {
    const ms = accumulatedWorkMs(
      [
        {
          startedAt: t("2026-08-14T01:00:00Z"),
          endedAt: t("2026-08-14T02:00:00Z"),
        },
      ],
      now,
    );
    expect(ms).toBe(60 * 60 * 1000);
  });

  it("open な作業セッションは now まで", () => {
    const ms = accumulatedWorkMs(
      [{ startedAt: t("2026-08-14T04:00:00Z"), endedAt: null }],
      now,
    );
    expect(ms).toBe(60 * 60 * 1000);
  });

  it("一時停止を挟んだ複数セッションは合算される（休憩は含まない）", () => {
    const ms = accumulatedWorkMs(
      [
        {
          startedAt: t("2026-08-14T01:00:00Z"),
          endedAt: t("2026-08-14T02:00:00Z"),
        },
        // 2:00〜4:00 は休憩 — 数えない
        { startedAt: t("2026-08-14T04:00:00Z"), endedAt: null },
      ],
      now,
    );
    expect(ms).toBe(2 * 60 * 60 * 1000);
  });

  it("startedAt が無い行は無視する", () => {
    expect(accumulatedWorkMs([{ startedAt: null, endedAt: now }], now)).toBe(0);
  });

  it("時計巻き戻し等で負になる区間は無視する", () => {
    const ms = accumulatedWorkMs(
      [
        {
          startedAt: t("2026-08-14T06:00:00Z"),
          endedAt: t("2026-08-14T05:00:00Z"),
        },
      ],
      now,
    );
    expect(ms).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("1 時間未満は M:SS", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65 * 1000)).toBe("1:05");
    expect(formatElapsed(59 * 60 * 1000 + 59 * 1000)).toBe("59:59");
  });
  it("1 時間以上は H:MM", () => {
    expect(formatElapsed(60 * 60 * 1000)).toBe("1:00");
    expect(formatElapsed(2 * 60 * 60 * 1000 + 34 * 60 * 1000)).toBe("2:34");
  });
  it("負値は 0 に丸める", () => {
    expect(formatElapsed(-5000)).toBe("0:00");
  });
});

describe("bucketOf", () => {
  it("今日基準で 遅延/本日/予定 に分ける", () => {
    expect(bucketOf("2026-08-13", "2026-08-14")).toBe("OVERDUE");
    expect(bucketOf("2026-08-14", "2026-08-14")).toBe("TODAY");
    expect(bucketOf("2026-08-15", "2026-08-14")).toBe("UPCOMING");
  });
  it("計画なし（ロック保持のみ）は本日扱い", () => {
    expect(bucketOf(null, "2026-08-14")).toBe("TODAY");
  });
});

describe("compareSteps", () => {
  const s = (over: Partial<SortableStep>): SortableStep => ({
    sessionState: "STARTABLE",
    plannedDate: "2026-08-14",
    plannedStartAt: null,
    workOrderNumber: 1,
    sortOrder: 0,
    ...over,
  });

  it("作業中 → 一時停止 → 開始可 → 待ち の順", () => {
    const list = [
      s({ sessionState: "BLOCKED" }),
      s({ sessionState: "STARTABLE" }),
      s({ sessionState: "PAUSED" }),
      s({ sessionState: "WORKING" }),
    ].sort(compareSteps);
    expect(list.map((x) => x.sessionState)).toEqual([
      "WORKING",
      "PAUSED",
      "STARTABLE",
      "BLOCKED",
    ]);
  });

  it("同状態なら計画日 → 開始時刻の順", () => {
    const list = [
      s({ plannedDate: "2026-08-15" }),
      s({ plannedDate: "2026-08-14", plannedStartAt: "13:00" }),
      s({ plannedDate: "2026-08-14", plannedStartAt: "09:00" }),
    ].sort(compareSteps);
    expect(list.map((x) => [x.plannedDate, x.plannedStartAt])).toEqual([
      ["2026-08-14", "09:00"],
      ["2026-08-14", "13:00"],
      ["2026-08-15", null],
    ]);
  });
});

describe("quantityFormDefaults", () => {
  it("良品 = 受入（不良なし）を既定にする", () => {
    expect(quantityFormDefaults(100)).toEqual({
      inputQuantity: 100,
      outputSuccessQuantity: 100,
      outputDefectSemiFinished: 0,
      outputDefectScrap: 0,
      outputDefectRework: 0,
    });
  });
  it("受入数不明は 0", () => {
    expect(quantityFormDefaults(null).inputQuantity).toBe(0);
  });
});

describe("不良リスト（{種別, 理由, 数}）", () => {
  const list: DefectReasonEntry[] = [
    { type: "SEMI", reason: "寸法不良", count: 3 },
    { type: "SCRAP", reason: "キズ", count: 2 },
    { type: "SCRAP", reason: "", count: 1 },
    { type: "REWORK", reason: "バリ", count: 4 },
  ];

  it("dispositionTotals: 種別ごとに合計", () => {
    expect(dispositionTotals(list)).toEqual({ semi: 3, scrap: 3, rework: 4 });
  });

  it("defectListTotal / deriveSuccessFromList", () => {
    expect(defectListTotal(list)).toBe(10);
    expect(deriveSuccessFromList(100, list)).toBe(90);
  });

  it("良品は負にならない（下限 0）", () => {
    expect(
      deriveSuccessFromList(5, [{ type: "SCRAP", reason: "", count: 20 }]),
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

  it("isReasonEntryComplete: 種別あり + 数≥1（理由は任意）", () => {
    expect(isReasonEntryComplete({ type: "SCRAP", reason: "", count: 2 })).toBe(
      true,
    );
    expect(
      isReasonEntryComplete({ type: "SCRAP", reason: "x", count: 0 }),
    ).toBe(false);
  });

  it("cleanReasonEntries: 有効行のみ・reason をトリム・種別を保持", () => {
    expect(
      cleanReasonEntries([
        { type: "SEMI", reason: " 寸法不良 ", count: 2 },
        { type: "SCRAP", reason: "x", count: 0 },
      ]),
    ).toEqual([{ type: "SEMI", reason: "寸法不良", count: 2 }]);
  });
});

describe("checkDefectList（良品は導出なので保存則は常に成立）", () => {
  const scrap = (count: number): DefectReasonEntry[] => [
    { type: "SCRAP", reason: "", count },
  ];

  it("NONE は常に問題なし（サーバーがパススルーする）", () => {
    expect(checkDefectList(scrap(3), 100, "NONE")).toBeNull();
  });

  it("不良が受入以内なら null", () => {
    expect(checkDefectList([], 100, "FLOW")).toBeNull();
    expect(checkDefectList(scrap(2), 100, "FLOW")).toBeNull();
    expect(checkDefectList(scrap(100), 100, "FLOW")).toBeNull();
  });

  it("不良が受入を超えれば OVER_INPUT", () => {
    const issue = checkDefectList(
      [
        { type: "SCRAP", reason: "", count: 60 },
        { type: "REWORK", reason: "", count: 50 },
      ],
      100,
      "FLOW",
    );
    expect(issue).toEqual({ kind: "OVER_INPUT", sum: 110, input: 100 });
  });

  it("負値は NEGATIVE", () => {
    expect(checkDefectList(scrap(-1), 100, "FLOW")).toEqual({
      kind: "NEGATIVE",
    });
  });

  it("NaN も NEGATIVE 扱い（空欄の入力）", () => {
    expect(checkDefectList(scrap(Number.NaN), 100, "FLOW")).toEqual({
      kind: "NEGATIVE",
    });
  });
});

describe("inspectionOutcome", () => {
  it("全項目合格なら PASS", () => {
    expect(inspectionOutcome([{ isPass: true }, { isPass: true }])).toBe(
      "PASS",
    );
  });

  it("1 つでも不合格なら FAIL", () => {
    expect(inspectionOutcome([{ isPass: true }, { isPass: false }])).toBe(
      "FAIL",
    );
  });

  it("空配列は PASS（every の空真 — 呼び出し側が ITEMS_REQUIRED で弾く）", () => {
    expect(inspectionOutcome([])).toBe("PASS");
  });
});

describe("missingRequiredItems", () => {
  const items = [
    { id: 1, isRequired: true },
    { id: 2, isRequired: false },
    { id: 3, isRequired: true },
  ];

  it("必須項目の未入力だけを列挙する", () => {
    expect(missingRequiredItems(items, { 1: "7.99" })).toEqual([3]);
  });

  it("空白のみは未入力扱い", () => {
    expect(missingRequiredItems(items, { 1: "  ", 3: "330" })).toEqual([1]);
  });

  it("任意項目は未入力でもよい", () => {
    expect(missingRequiredItems(items, { 1: "a", 3: "b" })).toEqual([]);
  });
});

describe("isDefectEntryComplete", () => {
  it("種類 + 内容が揃えば true", () => {
    expect(
      isDefectEntryComplete({ defectTypeId: 1, description: "キズあり" }),
    ).toBe(true);
  });

  it("種類未選択 / 内容が空白のみは false", () => {
    expect(
      isDefectEntryComplete({ defectTypeId: null, description: "x" }),
    ).toBe(false);
    expect(isDefectEntryComplete({ defectTypeId: 1, description: "  " })).toBe(
      false,
    );
  });
});
