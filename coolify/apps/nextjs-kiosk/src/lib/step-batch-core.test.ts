/**
 * 一括操作の純ロジック。
 *
 * 「どれを束ねてよいか」を固定する。ここが緩むと、束ねられない組み合わせを
 * 送ってサーバー側でばらばらに失敗する（現場からは「押しても何も起きない」に
 * 見える）。状態 → 操作の対応は availableActions から導いているので、
 * 片方だけ直したときの食い違いもここで落ちる。
 */

import { describe, expect, it } from "vitest";
import {
  type BatchCandidate,
  batchActionsFor,
  batchIneligibility,
  commonBatchActions,
  completesAsAllGood,
  groupByProcessStep,
  partitionForBatch,
  summarizeBatch,
} from "./step-batch-core";
import type { StepSessionState } from "./steps-core";

const row = (over: Partial<BatchCandidate> = {}): BatchCandidate => ({
  stepId: "s1",
  sessionState: "STARTABLE",
  lotInputMode: "NONE",
  quantityMode: "FLOW",
  inspectionMissing: false,
  ...over,
});

describe("batchActionsFor", () => {
  it("状態ごとの操作（再開は一括に含めない）", () => {
    expect(batchActionsFor("STARTABLE")).toEqual(["START"]);
    expect(batchActionsFor("WORKING")).toEqual(["PAUSE", "COMPLETE"]);
    // PAUSED は RESUME + COMPLETE だが、RESUME は v1 の一括対象外
    expect(batchActionsFor("PAUSED")).toEqual(["COMPLETE"]);
  });

  it("操作できない状態は空", () => {
    for (const s of [
      "BLOCKED",
      "OTHER",
      "COMPLETED",
      "CANCELLED",
    ] as StepSessionState[]) {
      expect(batchActionsFor(s)).toEqual([]);
    }
  });
});

describe("commonBatchActions", () => {
  it("同じ状態同士は共通操作を持つ", () => {
    expect(commonBatchActions(["STARTABLE", "STARTABLE"])).toEqual(["START"]);
    expect(commonBatchActions(["WORKING", "WORKING"])).toEqual([
      "PAUSE",
      "COMPLETE",
    ]);
  });

  it("作業中と一時停止は完了だけ共通", () => {
    expect(commonBatchActions(["WORKING", "PAUSED"])).toEqual(["COMPLETE"]);
  });

  // これが本体 — 束ねられない組み合わせは空を返し、画面がボタンを閉じる
  it("開始できる工程と作業中の工程が混ざると共通操作は無い", () => {
    expect(commonBatchActions(["STARTABLE", "WORKING"])).toEqual([]);
  });

  it("操作できない工程が 1 つ混ざれば空", () => {
    expect(commonBatchActions(["STARTABLE", "BLOCKED"])).toEqual([]);
  });

  it("空の選択は空", () => {
    expect(commonBatchActions([])).toEqual([]);
  });
});

describe("batchIneligibility", () => {
  it("状態が合わなければ NOT_SELECTABLE", () => {
    expect(batchIneligibility(row({ sessionState: "BLOCKED" }), "START")).toBe(
      "NOT_SELECTABLE",
    );
    expect(batchIneligibility(row({ sessionState: "OTHER" }), "COMPLETE")).toBe(
      "NOT_SELECTABLE",
    );
  });

  // ロットは 1 件ずつ違う値なので、1 つの確認画面ではまとめて入れられない
  it("ロット必須の工程は一括開始に載せない", () => {
    expect(batchIneligibility(row({ lotInputMode: "REQUIRED" }), "START")).toBe(
      "LOT_REQUIRED",
    );
  });

  it("ロット任意なら一括開始できる", () => {
    expect(
      batchIneligibility(row({ lotInputMode: "OPTIONAL" }), "START"),
    ).toBeNull();
  });

  it("未記入の検査表があると一括完了に載せない", () => {
    expect(
      batchIneligibility(
        row({ sessionState: "WORKING", inspectionMissing: true }),
        "COMPLETE",
      ),
    ).toBe("INSPECTION_REQUIRED");
  });

  // 検査表は完了のゲート — 一時停止には効かない
  it("検査表が未記入でも一時停止はできる", () => {
    expect(
      batchIneligibility(
        row({ sessionState: "WORKING", inspectionMissing: true }),
        "PAUSE",
      ),
    ).toBeNull();
  });
});

describe("partitionForBatch", () => {
  it("載る行と、理由つきで落ちる行に分ける", () => {
    const rows = [
      row({ stepId: "a" }),
      row({ stepId: "b", lotInputMode: "REQUIRED" }),
      row({ stepId: "c", sessionState: "BLOCKED" }),
      row({ stepId: "d" }),
    ];
    const { eligible, rejected } = partitionForBatch(rows, "START");
    expect(eligible.map((r) => r.stepId)).toEqual(["a", "d"]);
    expect(rejected.map((r) => [r.row.stepId, r.reason])).toEqual([
      ["b", "LOT_REQUIRED"],
      ["c", "NOT_SELECTABLE"],
    ]);
  });
});

describe("completesAsAllGood", () => {
  // 数量を数えない工程は元から入力が要らない
  it("NONE は数量入力そのものが無い", () => {
    expect(completesAsAllGood(row({ quantityMode: "NONE" }))).toBe(false);
  });

  it("数える工程は全数良品として完了する", () => {
    expect(completesAsAllGood(row({ quantityMode: "FLOW" }))).toBe(true);
    expect(completesAsAllGood(row({ quantityMode: "INSPECTION" }))).toBe(true);
  });
});

describe("summarizeBatch", () => {
  it("成功・失敗を数え、失敗した工程の id を残す（再試行のため）", () => {
    expect(
      summarizeBatch([
        { stepId: "a", ok: true },
        { stepId: "b", ok: false, codes: ["LOCK_TAKEN"] },
        { stepId: "c", ok: true },
      ]),
    ).toEqual({ succeeded: 2, failed: 1, failedIds: ["b"] });
  });

  it("空は 0 件", () => {
    expect(summarizeBatch([])).toEqual({
      succeeded: 0,
      failed: 0,
      failedIds: [],
    });
  });
});

describe("groupByProcessStep", () => {
  // ★ 鍵は id — 名前は多言語 Json を 1 言語に潰した値なので同名があり得る
  it("同じ名前でもカタログ行が違えば別のまとまり", () => {
    const groups = groupByProcessStep([
      { processStepId: 1, stepName: "円筒加工", stepId: "a" },
      { processStepId: 1, stepName: "円筒加工", stepId: "b" },
      { processStepId: 2, stepName: "円筒加工", stepId: "c" },
      { processStepId: 2, stepName: "円筒加工", stepId: "d" },
    ]);
    expect(groups.map((g) => g.processStepId)).toEqual([1, 2]);
    expect(groups[0].rows.map((r) => r.stepId)).toEqual(["a", "b"]);
  });

  it("1 件しかない工程はまとめない（束ねる意味が無い）", () => {
    expect(
      groupByProcessStep([
        { processStepId: 1, stepName: "円筒加工", stepId: "a" },
        { processStepId: 2, stepName: "研磨", stepId: "b" },
      ]),
    ).toEqual([]);
  });

  it("出現順を保つ", () => {
    const groups = groupByProcessStep([
      { processStepId: 9, stepName: "研磨", stepId: "a" },
      { processStepId: 1, stepName: "円筒加工", stepId: "b" },
      { processStepId: 9, stepName: "研磨", stepId: "c" },
      { processStepId: 1, stepName: "円筒加工", stepId: "d" },
    ]);
    expect(groups.map((g) => g.processStepId)).toEqual([9, 1]);
  });
});
