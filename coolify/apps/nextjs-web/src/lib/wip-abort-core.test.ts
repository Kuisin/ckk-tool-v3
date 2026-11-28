import { describe, expect, it } from "vitest";
import {
  abortBlock,
  abortPositions,
  abortPremiseIssues,
  abortSettlement,
  defaultAbortInputs,
  parseAbortPayload,
  validateAbortRequest,
} from "./wip-abort-core";
import type { StepLinkState, StepState } from "./workflow-core";

const step = (
  id: string,
  processStepId: number,
  sortOrder: number,
  status: StepState["status"] = "COMPLETED",
  q: Partial<StepState> = {},
): StepState => ({
  id,
  processStepId,
  status,
  sortOrder,
  inputQuantity: null,
  outputSuccess: null,
  defectSemiFinished: null,
  defectScrap: null,
  defectRework: null,
  sessionLockedBy: null,
  ...q,
});

function must<T>(v: T | null): T {
  if (v == null) throw new Error("expected a value");
  return v;
}

const link = (
  sourceStepId: string,
  targetStepId: string,
  routedQuantity = 0,
): StepLinkState => ({ sourceStepId, targetStepId, routedQuantity });

// カタログ id: 1 = 素材出し（数えない）/ 10 = 切断 / 20 = 円筒 /
// 30 = 段加工 / 40 = 検査（数えない）/ 60 = 手直し研削
const COUNTS = new Set([10, 20, 30, 60]);
const affects = (id: number) => COUNTS.has(id);

describe("abortPositions", () => {
  it("進行中の工程の受入数 — 加工状態にその工程は入れない", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
      step("b", 10, 2, "COMPLETED", { inputQuantity: 10, outputSuccess: 9 }),
      step("c", 20, 3, "IN_PROGRESS", { inputQuantity: 9 }),
      step("d", 40, 4, "PENDING"),
    ];
    const positions = abortPositions(steps, [], affects);
    expect(positions).toEqual([
      {
        key: "S:c",
        kind: "IN_STEP",
        stepId: "c",
        sourceStepId: null,
        quantity: 9,
        path: { stepIds: [10], ambiguous: false, alternatives: [] },
      },
    ]);
  });

  it("完了した工程の後ろで待っている分 — 出どころの工程は済んでいる", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
      step("b", 10, 2, "COMPLETED", { inputQuantity: 10, outputSuccess: 8 }),
      step("c", 20, 3, "PENDING"),
    ];
    const [pos] = abortPositions(steps, [], affects);
    expect(pos.kind).toBe("WAITING");
    expect(pos.stepId).toBe("c");
    expect(pos.sourceStepId).toBe("b");
    expect(pos.quantity).toBe(8);
    expect(pos.path.stepIds).toEqual([10]);
  });

  it("開始状態（在庫の仕掛品から始めた指示書）を頭に付ける", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 5, outputSuccess: 5 }),
      step("c", 30, 2, "IN_PROGRESS", { inputQuantity: 5 }),
    ];
    const [pos] = abortPositions(steps, [], affects, {
      startStepIds: [10, 20],
    });
    expect(pos.path.stepIds).toEqual([10, 20]);
  });

  it("受入数が未記録の進行中工程は想定受入数で数える", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 7, outputSuccess: 7 }),
      step("b", 10, 2, "IN_PROGRESS"),
    ];
    const [pos] = abortPositions(steps, [], affects);
    expect(pos.quantity).toBe(7);
  });

  it("工程分岐で抜いた分（静的リンク）は出どころを済んだことにしない", () => {
    // b の不良 2 本を手直し系列 r へ。本流の c は未着手。
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
      step("b", 20, 2, "COMPLETED", {
        inputQuantity: 10,
        outputSuccess: 8,
        defectRework: 2,
      }),
      step("c", 30, 3, "PENDING"),
      step("r", 60, 10, "PENDING"),
    ];
    const links = [link("b", "r", 2), link("r", "c")];
    const positions = abortPositions(steps, links, affects);
    const main = positions.find((p) => p.stepId === "c");
    const branch = positions.find((p) => p.stepId === "r");
    expect(main?.quantity).toBe(8);
    expect(main?.path.stepIds).toEqual([20]);
    expect(branch?.quantity).toBe(2);
    // 手直しへ回した品は円筒を終えていない。
    expect(branch?.path.stepIds).toEqual([]);
  });

  it("合流の後ろで進行中なら加工状態は曖昧（推奨 = 本流）", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
      step("b", 20, 2, "COMPLETED", {
        inputQuantity: 10,
        outputSuccess: 8,
        defectRework: 2,
      }),
      step("c", 30, 3, "IN_PROGRESS", { inputQuantity: 10 }),
      step("r", 60, 10, "COMPLETED", { inputQuantity: 2, outputSuccess: 2 }),
    ];
    const links = [link("b", "r", 2), link("r", "c")];
    const [pos] = abortPositions(steps, links, affects);
    expect(pos.key).toBe("S:c");
    expect(pos.path.ambiguous).toBe(true);
    expect(pos.path.stepIds).toEqual([20]);
    expect(pos.path.alternatives).toContainEqual([20, 60]);
  });

  it("完了・キャンセル・未着手（品が来ていない）は位置にならない", () => {
    const steps = [
      step("a", 1, 1, "COMPLETED", { inputQuantity: 3, outputSuccess: 3 }),
      step("b", 10, 2, "IN_PROGRESS", { inputQuantity: 3 }),
      step("c", 20, 3, "PENDING"),
      step("x", 30, 4, "CANCELLED"),
    ];
    expect(abortPositions(steps, [], affects).map((p) => p.key)).toEqual([
      "S:b",
    ]);
  });
});

describe("validateAbortRequest", () => {
  const steps = [
    step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
    step("b", 10, 2, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
    step("c", 20, 3, "IN_PROGRESS", { inputQuantity: 10 }),
  ];
  const positions = abortPositions(steps, [], affects);
  const blank = { diameterMm: 8, lengthMm: 100 };

  it("理由は必須", () => {
    const { issues } = validateAbortRequest({
      positions,
      reason: "  ",
      inputs: [
        {
          key: "S:c",
          returnQuantity: 10,
          scrapQuantity: 0,
          finishedDiameterMm: 7.9,
          finishedLengthMm: 99,
        },
      ],
      blank,
    });
    expect(issues).toContainEqual({ kind: "reasonRequired" });
  });

  it("戻す + 廃棄 = 位置の本数でなければ拒む（黙って消える数を作らない）", () => {
    const { issues } = validateAbortRequest({
      positions,
      reason: "受注取消",
      inputs: [
        {
          key: "S:c",
          returnQuantity: 6,
          scrapQuantity: 3,
          finishedDiameterMm: 7.9,
          finishedLengthMm: 99,
        },
      ],
      blank,
    });
    expect(issues).toEqual([{ kind: "quantityMismatch", key: "S:c" }]);
  });

  it("位置の答え漏れ・知らない位置を拒む", () => {
    const { issues } = validateAbortRequest({
      positions,
      reason: "x",
      inputs: [{ key: "S:zz", returnQuantity: 0, scrapQuantity: 0 }],
      blank,
    });
    expect(issues).toContainEqual({ kind: "positionUnknown", key: "S:zz" });
    expect(issues).toContainEqual({ kind: "positionMissing", key: "S:c" });
  });

  it("形を変える工程が済んでいれば仕上がり寸法が必須", () => {
    const { issues } = validateAbortRequest({
      positions,
      reason: "x",
      inputs: [{ key: "S:c", returnQuantity: 10, scrapQuantity: 0 }],
      blank,
    });
    expect(issues).toContainEqual({
      kind: "wip",
      key: "S:c",
      issue: "finishedDiameterRequired",
    });
    expect(issues).toContainEqual({
      kind: "wip",
      key: "S:c",
      issue: "finishedLengthRequired",
    });
  });

  it("全部廃棄なら寸法は要らない", () => {
    const { issues, payload } = validateAbortRequest({
      positions,
      reason: "x",
      inputs: [{ key: "S:c", returnQuantity: 0, scrapQuantity: 10 }],
      blank,
    });
    expect(issues).toEqual([]);
    expect(abortSettlement(must(payload))).toEqual({
      postings: [],
      scrap: 10,
      returned: 0,
    });
  });

  it("何も済んでいなければブランクの寸法を既定にする", () => {
    const early = abortPositions(
      [
        step("a", 1, 1, "COMPLETED", { inputQuantity: 4, outputSuccess: 4 }),
        step("b", 10, 2, "IN_PROGRESS", { inputQuantity: 4 }),
      ],
      [],
      affects,
    );
    const { issues, payload } = validateAbortRequest({
      positions: early,
      reason: "x",
      inputs: defaultAbortInputs(early),
      blank,
    });
    expect(issues).toEqual([]);
    expect(payload?.positions[0]).toMatchObject({
      stepIds: [],
      finishedDiameterMm: 8,
      finishedLengthMm: 100,
    });
  });

  it("曖昧な加工状態は候補のどれかを選ぶ", () => {
    const merged = abortPositions(
      [
        step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
        step("b", 20, 2, "COMPLETED", {
          inputQuantity: 10,
          outputSuccess: 8,
          defectRework: 2,
        }),
        step("c", 30, 3, "IN_PROGRESS", { inputQuantity: 10 }),
        step("r", 60, 10, "COMPLETED", { inputQuantity: 2, outputSuccess: 2 }),
      ],
      [link("b", "r", 2), link("r", "c")],
      affects,
    );
    const base = {
      key: "S:c",
      returnQuantity: 10,
      scrapQuantity: 0,
      finishedDiameterMm: 7.5,
      finishedLengthMm: 98,
    };
    expect(
      validateAbortRequest({
        positions: merged,
        reason: "x",
        inputs: [{ ...base, pathStepIds: [99] }],
        blank,
      }).issues,
    ).toContainEqual({ kind: "wip", key: "S:c", issue: "pathChoiceInvalid" });
    const ok = validateAbortRequest({
      positions: merged,
      reason: "x",
      inputs: [{ ...base, pathStepIds: [20, 60] }],
      blank,
    });
    expect(ok.issues).toEqual([]);
    expect(ok.payload?.positions[0].stepIds).toEqual([20, 60]);
  });

  it("戻す分を計上の形にする（発生工程・加工状態・寸法）", () => {
    const { payload } = validateAbortRequest({
      positions,
      reason: "x",
      inputs: [
        {
          key: "S:c",
          returnQuantity: 7,
          scrapQuantity: 3,
          finishedDiameterMm: 7.9,
          finishedLengthMm: 99,
        },
      ],
      blank,
    });
    expect(abortSettlement(must(payload))).toEqual({
      postings: [
        {
          sourceStepId: "c",
          quantity: 7,
          stepIds: [10],
          finishedDiameterMm: 7.9,
          finishedLengthMm: 99,
        },
      ],
      scrap: 3,
      returned: 7,
    });
  });
});

describe("abortPremiseIssues", () => {
  const before = [
    step("a", 1, 1, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
    step("b", 10, 2, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
    step("c", 20, 3, "PENDING"),
    step("d", 30, 4, "PENDING"),
  ];
  const positions = abortPositions(before, [], affects);
  const { payload } = validateAbortRequest({
    positions,
    reason: "x",
    inputs: [
      {
        key: positions[0].key,
        returnQuantity: 10,
        scrapQuantity: 0,
        finishedDiameterMm: 7.9,
        finishedLengthMm: 99,
      },
    ],
    blank: null,
  });

  it("状態が変わっていなければ当てはまる", () => {
    expect(abortPremiseIssues(must(payload), positions)).toEqual([]);
  });

  it("申請のあとで工程が進んだら当てはまらない", () => {
    const after = abortPositions(
      [
        before[0],
        before[1],
        step("c", 20, 3, "IN_PROGRESS", { inputQuantity: 10 }),
        before[3],
      ],
      [],
      affects,
    );
    const kinds = abortPremiseIssues(must(payload), after).map((i) => i.kind);
    expect(kinds).toContain("positionGone");
    expect(kinds).toContain("positionAdded");
  });

  it("保存した payload を読み直せる（壊れた形は null）", () => {
    expect(parseAbortPayload(JSON.parse(JSON.stringify(payload)))).toEqual(
      payload,
    );
    expect(parseAbortPayload({ version: 2, positions: [] })).toBeNull();
    expect(parseAbortPayload({ version: 1, positions: [{ key: 1 }] })).toBe(
      null,
    );
  });
});

describe("abortBlock", () => {
  it("進行中の製造分だけ打ち切れる", () => {
    expect(abortBlock({ status: "IN_PROGRESS", type: "MANUFACTURE" })).toBe(
      null,
    );
    expect(abortBlock({ status: "APPROVED", type: "MANUFACTURE" })).toBe(
      "notInProgress",
    );
    expect(abortBlock({ status: "IN_PROGRESS", type: "FROM_STOCK" })).toBe(
      "typeNotAbortable",
    );
    expect(abortBlock({ status: "IN_PROGRESS", type: "REGRIND" })).toBe(
      "typeNotAbortable",
    );
  });
});
