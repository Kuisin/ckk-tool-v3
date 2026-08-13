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
  checkConservation,
  compareSteps,
  formatElapsed,
  inspectionOutcome,
  isDefectEntryComplete,
  missingRequiredItems,
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

describe("checkConservation", () => {
  const v = (over: Partial<ReturnType<typeof quantityFormDefaults>> = {}) => ({
    ...quantityFormDefaults(100),
    ...over,
  });

  it("NONE は常に問題なし（サーバーがパススルーする）", () => {
    expect(
      checkConservation(v({ outputSuccessQuantity: 3 }), "NONE"),
    ).toBeNull();
  });

  it("保存則が成立していれば null", () => {
    expect(checkConservation(v(), "FLOW")).toBeNull();
    expect(
      checkConservation(
        v({ outputSuccessQuantity: 98, outputDefectScrap: 2 }),
        "FLOW",
      ),
    ).toBeNull();
  });

  it("合計が受入と違えば CONSERVATION", () => {
    const issue = checkConservation(v({ outputSuccessQuantity: 98 }), "FLOW");
    expect(issue).toEqual({ kind: "CONSERVATION", sum: 98, input: 100 });
  });

  it("INSPECTION も同じ数式（ラベルだけが違う）", () => {
    expect(
      checkConservation(
        v({ outputSuccessQuantity: 90, outputDefectScrap: 10 }),
        "INSPECTION",
      ),
    ).toBeNull();
  });

  it("負値は NEGATIVE", () => {
    expect(checkConservation(v({ outputDefectScrap: -1 }), "FLOW")).toEqual({
      kind: "NEGATIVE",
    });
  });

  it("NaN も NEGATIVE 扱い（空欄の NumberInput）", () => {
    expect(
      checkConservation(v({ outputSuccessQuantity: Number.NaN }), "FLOW"),
    ).toEqual({ kind: "NEGATIVE" });
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
