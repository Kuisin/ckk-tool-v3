import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import {
  approvalStepDescription,
  decideAfterApproval,
  type FlowStepDraft,
  isStepComplete,
  type RequiredApproverState,
  remainingApprovers,
  stepFromSnapshot,
  stepperActive,
  stepsFromSnapshot,
  validateFlowSteps,
} from "./approval-flow";

/**
 * `master.approvalSettingsActions.stepMissing*` はまだ messages/ja.json に
 * 無いことがある（並行して他のエージェントが追加中）ので、テスト用に
 * ローカルで足す。同じ文言で追加されれば無害。
 */
const messages = {
  ...ja,
  master: {
    ...ja.master,
    approvalSettingsActions: {
      ...ja.master.approvalSettingsActions,
      stepMissingName: "{steps} 段目: 名称を入力してください",
      stepMissingGroupIndividual:
        "{steps} 段目: 承認グループを選ぶか、承認者を 1 人以上選んでください",
      stepMissingGroup: "{steps} 段目: 承認グループを選択してください",
    },
  },
};
const tr = createTranslator({ locale: "ja", messages });

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
    expect(validateFlowSteps([], false, tr)).toEqual([
      "承認ステップを 1 段以上設定してください",
    ]);
  });

  it("名称空とグループ未選択を行番号つきで返す", () => {
    const issues = validateFlowSteps(
      [
        { nameJa: "第一承認", groupId: 1, mode: "ANY" },
        { nameJa: "  ", groupId: null, mode: "ALL" },
      ],
      false,
      tr,
    );
    expect(issues).toEqual([
      "2 段目: 名称を入力してください",
      "2 段目: 承認グループを選択してください",
    ]);
  });

  it("揃っていれば空", () => {
    expect(
      validateFlowSteps(
        [{ nameJa: "第一承認", groupId: 1, mode: "ANY" }],
        false,
        tr,
      ),
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

describe("validateFlowSteps — カスタム段（承認者を直接指名）", () => {
  const step = (over: Partial<FlowStepDraft> = {}): FlowStepDraft => ({
    nameJa: "一次承認",
    groupId: null,
    mode: "ANY",
    ...over,
  });

  it("承認者が 1 人でも入っていればグループ未選択で通る", () => {
    expect(
      validateFlowSteps([step({ approverUserIds: ["u1"] })], true, tr),
    ).toEqual([]);
  });

  it("承認者が複数でも通る", () => {
    expect(
      validateFlowSteps([step({ approverUserIds: ["u1", "u2"] })], true, tr),
    ).toEqual([]);
  });

  it("カスタムで承認者ゼロは弾く（誰も押せない段を作らない）", () => {
    expect(
      validateFlowSteps([step({ approverUserIds: [] })], true, tr),
    ).toEqual([
      "1 段目: 承認グループを選ぶか、承認者を 1 人以上選んでください",
    ]);
  });

  it("どちらも空なら弾く（カスタムを許す場合の文言）", () => {
    expect(validateFlowSteps([step()], true, tr)).toEqual([
      "1 段目: 承認グループを選ぶか、承認者を 1 人以上選んでください",
    ]);
  });

  it("カスタムを許さない場面（MS0B）の文言は変わらない", () => {
    expect(validateFlowSteps([step()], false, tr)).toEqual([
      "1 段目: 承認グループを選択してください",
    ]);
  });

  it("カスタムを許さない場面では承認者が渡っても通さない", () => {
    // MS0B の共通フローはカスタムを持てない — 誤って渡っても宛先なし扱い。
    expect(
      validateFlowSteps([step({ approverUserIds: ["u1"] })], false, tr),
    ).toEqual(["1 段目: 承認グループを選択してください"]);
  });
});

describe("approvalStepDescription", () => {
  // 段の説明は 4 画面（注文請書 / 設計依頼 / 購買依頼 / 素材発注書）が共有する。
  // 以前は各画面に同じ関数が重複していて、直し漏れると説明が食い違っていた。
  const approval = (
    over: Partial<Parameters<typeof approvalStepDescription>[0]> = {},
  ) => ({
    phase: "PENDING" as const,
    stepNo: 2,
    stepCount: 3,
    stepLabel: "部門承認",
    groupLabel: "製造部",
    ...over,
  });

  it("進行中で多段なら「何段目 / 全何段 + 段名」", () => {
    expect(approvalStepDescription(approval(), tr)).toBe("2/3 部門承認");
  });

  it("進行中でも 1 段だけならグループ名（段数を出しても情報が無い）", () => {
    expect(
      approvalStepDescription(approval({ stepCount: 1, stepNo: 1 }), tr),
    ).toBe("製造部");
  });

  it("依頼前・承認済み・差し戻しはグループ名", () => {
    for (const phase of ["NONE", "APPROVED", "REJECTED"] as const) {
      expect(approvalStepDescription(approval({ phase }), tr)).toBe("製造部");
    }
  });

  it("グループ名が空なら既定の文言に落とす（空欄を出さない）", () => {
    expect(
      approvalStepDescription(approval({ phase: "NONE", groupLabel: "" }), tr),
    ).toBe("承認グループ");
  });
});
