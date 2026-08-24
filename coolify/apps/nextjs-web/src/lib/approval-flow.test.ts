import { describe, expect, it } from "vitest";
import {
  decideAfterApproval,
  isStepComplete,
  type RequiredApproverState,
  remainingApprovers,
  stepFromSnapshot,
  stepperActive,
  stepsFromSnapshot,
  validateFlowSteps,
} from "./approval-flow";

const slot = (userId: string, acted: boolean): RequiredApproverState => ({
  userId,
  actedAt: acted ? new Date("2026-08-19T10:00:00Z") : null,
});

describe("isStepComplete", () => {
  it("ANY は枠が残っていても閉じる", () => {
    expect(isStepComplete("ANY", [slot("a", false), slot("b", false)])).toBe(
      true,
    );
  });

  it("ALL は未承認の枠が残っていれば閉じない", () => {
    expect(isStepComplete("ALL", [slot("a", true), slot("b", false)])).toBe(
      false,
    );
  });

  it("ALL は全枠が埋まったら閉じる", () => {
    expect(isStepComplete("ALL", [slot("a", true), slot("b", true)])).toBe(
      true,
    );
  });

  it("ALL で枠が 0 件なら閉じる（誰も進められず詰むのを避ける）", () => {
    expect(isStepComplete("ALL", [])).toBe(true);
  });
});

describe("remainingApprovers", () => {
  it("未承認の枠だけ返す", () => {
    expect(
      remainingApprovers([slot("a", true), slot("b", false), slot("c", false)]),
    ).toEqual(["b", "c"]);
  });
});

describe("decideAfterApproval", () => {
  it("ALL で枠が残っていれば段は閉じない", () => {
    expect(
      decideAfterApproval({
        mode: "ALL",
        required: [slot("a", true), slot("b", false)],
        stepNo: 1,
        stepCount: 3,
      }),
    ).toEqual({ stepClosed: false, flowCompleted: false, nextStepNo: null });
  });

  it("段が閉じて後続があれば次段へ", () => {
    expect(
      decideAfterApproval({
        mode: "ANY",
        required: [slot("a", true)],
        stepNo: 1,
        stepCount: 3,
      }),
    ).toEqual({ stepClosed: true, flowCompleted: false, nextStepNo: 2 });
  });

  it("最終段が閉じたらフロー完了で次段は無い", () => {
    expect(
      decideAfterApproval({
        mode: "ALL",
        required: [slot("a", true), slot("b", true)],
        stepNo: 3,
        stepCount: 3,
      }),
    ).toEqual({ stepClosed: true, flowCompleted: true, nextStepNo: null });
  });

  it("1 段だけのフローは 1 件承認で完了する", () => {
    expect(
      decideAfterApproval({
        mode: "ANY",
        required: [slot("a", true)],
        stepNo: 1,
        stepCount: 1,
      }),
    ).toEqual({ stepClosed: true, flowCompleted: true, nextStepNo: null });
  });
});

describe("stepperActive", () => {
  it("PENDING は現在段を指す（0 起点）", () => {
    expect(stepperActive(3, 1, "PENDING")).toBe(0);
    expect(stepperActive(3, 2, "PENDING")).toBe(1);
  });

  it("APPROVED は全段の先", () => {
    expect(stepperActive(3, 3, "APPROVED")).toBe(3);
  });

  it("NONE / REJECTED はどの段もアクティブにしない", () => {
    expect(stepperActive(3, 1, "NONE")).toBe(-1);
    expect(stepperActive(3, 2, "REJECTED")).toBe(-1);
  });
});

describe("validateFlowSteps", () => {
  it("0 段は弾く", () => {
    expect(validateFlowSteps([])).toEqual([
      "承認ステップを 1 段以上設定してください",
    ]);
  });

  it("名称空とグループ未選択を行番号つきで返す", () => {
    const issues = validateFlowSteps([
      { nameJa: "第一承認", groupId: 1, mode: "ANY" },
      { nameJa: "  ", groupId: null, mode: "ALL" },
    ]);
    expect(issues).toEqual([
      "2 段目: 名称を入力してください",
      "2 段目: 承認グループを選択してください",
    ]);
  });

  it("揃っていれば空", () => {
    expect(
      validateFlowSteps([{ nameJa: "第一承認", groupId: 1, mode: "ANY" }]),
    ).toEqual([]);
  });
});

describe("snapshot readers", () => {
  const snap = [
    {
      stepNo: 1,
      name: { ja: "第一承認", en: "First" },
      groupId: 1,
      groupName: { ja: "工場長", en: "" },
      mode: "ANY",
    },
    {
      stepNo: 2,
      name: { ja: "第二承認", en: "Second" },
      groupId: 2,
      groupName: { ja: "部長", en: "" },
      mode: "ALL",
    },
  ];

  it("段を引ける", () => {
    expect(stepFromSnapshot(snap, 2)?.name.ja).toBe("第二承認");
  });

  it("範囲外は null", () => {
    expect(stepFromSnapshot(snap, 9)).toBeNull();
  });

  it("壊れた値でも落ちない", () => {
    expect(stepFromSnapshot(null, 1)).toBeNull();
    expect(stepsFromSnapshot("nope")).toEqual([]);
    expect(stepsFromSnapshot([null, { stepNo: 1 }])).toHaveLength(1);
  });
});
