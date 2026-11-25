import { describe, expect, it } from "vitest";
import {
  computeSemiFinishedSources,
  defaultAffectsWipState,
  isWipPrefix,
  matchWip,
  semiFinishedSourcePath,
  type WipBucket,
  type WipMatchProduct,
  wipPathForSource,
  wipSignature,
} from "./wip-state-core";
import {
  computeBranchSemiFinishedQuantity,
  type StepLinkState,
  type StepState,
} from "./workflow-core";

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

const link = (
  sourceStepId: string,
  targetStepId: string,
  routedQuantity = 0,
): StepLinkState => ({ sourceStepId, targetStepId, routedQuantity });

// カタログ id: 1 = 素材出し（開始・数えない）/ 10 = 切断 / 20 = 円筒 /
// 30 = 段加工 / 40 = 検査（数えない）/ 50 = コーティング / 60 = 手直し研削
const COUNTS = new Set([10, 20, 30, 50, 60]);
const affects = (id: number) => COUNTS.has(id);

describe("defaultAffectsWipState", () => {
  it("材料準備・加工・コーティングは数える", () => {
    expect(defaultAffectsWipState({ category: "MACHINING", code: "X" })).toBe(
      true,
    );
    expect(defaultAffectsWipState({ category: "COATING", code: "X" })).toBe(
      true,
    );
    expect(
      defaultAffectsWipState({ category: "MATERIAL_PREP", code: "CUT" }),
    ).toBe(true);
  });

  it("検査・承認・出荷・再研磨は数えない", () => {
    for (const category of ["INSPECTION", "APPROVAL", "SHIPPING", "REGRIND"]) {
      expect(defaultAffectsWipState({ category, code: "X" })).toBe(false);
    }
  });

  it("開始工程はカテゴリが材料準備でも数えない", () => {
    expect(
      defaultAffectsWipState({
        category: "MATERIAL_PREP",
        code: "MATERIAL_ISSUE",
      }),
    ).toBe(false);
    expect(
      defaultAffectsWipState({
        category: "MATERIAL_PREP",
        code: "SEMI_FINISHED_ISSUE",
      }),
    ).toBe(false);
  });
});

describe("wipSignature / isWipPrefix", () => {
  it("順序を保つ（並べ替えない）", () => {
    expect(wipSignature([20, 30])).toBe("20,30");
    expect(wipSignature([30, 20])).toBe("30,20");
    expect(wipSignature([20, 30])).not.toBe(wipSignature([30, 20]));
  });

  it("空の状態は空文字、同じ工程の繰り返しも許す", () => {
    expect(wipSignature([])).toBe("");
    expect(wipSignature([20, 20])).toBe("20,20");
  });

  it("正の整数以外は拒む", () => {
    expect(() => wipSignature([0])).toThrow();
    expect(() => wipSignature([1.5])).toThrow();
  });

  it("prefix 判定", () => {
    expect(isWipPrefix([], [10, 20])).toBe(true);
    expect(isWipPrefix([10], [10, 20])).toBe(true);
    expect(isWipPrefix([10, 20], [10, 20])).toBe(true);
    expect(isWipPrefix([20], [10, 20])).toBe(false);
    expect(isWipPrefix([10, 20, 30], [10, 20])).toBe(false);
  });
});

describe("wipPathForSource", () => {
  // 本流: 素材出し → 切断 → 円筒 → 検査 → 段加工
  const main = [
    step("s", 1, 0),
    step("cut", 10, 10),
    step("cyl", 20, 20),
    step("insp", 40, 30),
    step("stp", 30, 40, "PENDING"),
  ];

  it("本流: 開始工程と検査を除いた、数える工程だけを早い順に", () => {
    expect(wipPathForSource(main, [], "insp", affects)).toEqual({
      stepIds: [10, 20],
      ambiguous: false,
      alternatives: [],
    });
    expect(wipPathForSource(main, [], "cyl", affects).stepIds).toEqual([
      10, 20,
    ]);
  });

  it("includeSource=false は発生元を済んだことにしない", () => {
    expect(
      wipPathForSource(main, [], "cyl", affects, { includeSource: false })
        .stepIds,
    ).toEqual([10]);
  });

  it("CANCELLED の工程は通っていない", () => {
    const steps = main.map((s) =>
      s.id === "cut" ? { ...s, status: "CANCELLED" as const } : s,
    );
    expect(wipPathForSource(steps, [], "insp", affects).stepIds).toEqual([20]);
  });

  it("分岐系列: 分岐元までの本流 + 系列内の工程", () => {
    // cyl の工程分岐 → 手直し研削(r1) → コーティング(r2) で半製品在庫へ
    const steps = [
      ...main,
      step("r1", 60, 50),
      step("r2", 50, 60, "COMPLETED", { branchStock: "SEMI_FINISHED" }),
    ];
    const links = [link("cyl", "r1", 2), link("r1", "r2", 0)];
    expect(wipPathForSource(steps, links, "r2", affects)).toEqual({
      stepIds: [10, 20, 60, 50],
      ambiguous: false,
      alternatives: [],
    });
  });

  it("合流後: 推奨は本流、合流してきた分岐の経路は別案として返す", () => {
    const steps = [
      step("s", 1, 0),
      step("cut", 10, 10),
      step("cyl", 20, 20, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("stp", 30, 40),
      step("r1", 60, 50),
    ];
    const links = [link("cyl", "r1", 2), link("r1", "stp", 0)];
    expect(wipPathForSource(steps, links, "stp", affects)).toEqual({
      stepIds: [10, 20, 30],
      ambiguous: true,
      alternatives: [[10, 20, 60, 30]],
    });
  });

  it("合流してきた経路が数える工程を含まなければ曖昧ではない", () => {
    // 分岐側が検査（数えない）だけなら、どちらを辿っても同じ並び
    const steps = [
      step("s", 1, 0),
      step("cut", 10, 10),
      step("cyl", 20, 20),
      step("stp", 30, 40),
      step("r1", 40, 50),
    ];
    const links = [link("cyl", "r1", 2), link("r1", "stp", 0)];
    expect(wipPathForSource(steps, links, "stp", affects)).toEqual({
      stepIds: [10, 20, 30],
      ambiguous: false,
      alternatives: [],
    });
  });

  it("合流より手前が発生元なら曖昧ではない", () => {
    const steps = [
      step("s", 1, 0),
      step("cut", 10, 10),
      step("cyl", 20, 20),
      step("stp", 30, 40),
      step("r1", 60, 50),
    ];
    const links = [link("cyl", "r1", 2), link("r1", "stp", 0)];
    expect(wipPathForSource(steps, links, "cyl", affects).ambiguous).toBe(
      false,
    );
  });

  it("知らない工程 id は空", () => {
    expect(wipPathForSource(main, [], "nope", affects)).toEqual({
      stepIds: [],
      ambiguous: false,
      alternatives: [],
    });
  });
});

describe("computeSemiFinishedSources", () => {
  const mainA = step("a", 10, 10, "COMPLETED", {
    inputQuantity: 10,
    outputSuccess: 8,
    defectRework: 2,
  });
  const mainB = step("b", 20, 20, "COMPLETED", {
    inputQuantity: 8,
    outputSuccess: 7,
    defectSemiFinished: 1,
  });
  const branchR = (q: Partial<StepState> = {}) =>
    step("r", 60, 30, "COMPLETED", {
      inputQuantity: 2,
      outputSuccess: 2,
      ...q,
    });
  const branchIn = link("a", "r", 2);

  const cases: { name: string; steps: StepState[]; links: StepLinkState[] }[] =
    [
      {
        name: "半製品で終わる分岐 + 途中の振り分け",
        steps: [mainA, mainB, branchR({ branchStock: "SEMI_FINISHED" })],
        links: [branchIn],
      },
      {
        name: "合流する分岐",
        steps: [mainA, mainB, branchR()],
        links: [branchIn, link("r", "b", 0)],
      },
      {
        name: "製品で終わる分岐",
        steps: [mainA, mainB, branchR({ branchStock: "PRODUCT" })],
        links: [branchIn],
      },
      {
        name: "未完了の分岐終端",
        steps: [
          mainA,
          mainB,
          branchR({ status: "IN_PROGRESS", branchStock: "SEMI_FINISHED" }),
        ],
        links: [branchIn],
      },
    ];

  for (const c of cases) {
    it(`合計が従来の計上と一致する（${c.name}）`, () => {
      const sources = computeSemiFinishedSources(c.steps, c.links);
      const branchSum = sources
        .filter((s) => s.kind === "BRANCH_TERMINAL")
        .reduce((sum, s) => sum + s.quantity, 0);
      expect(branchSum).toBe(
        computeBranchSemiFinishedQuantity(c.steps, c.links),
      );
      // onWorkOrderCompletedTx の semiTotal と同じ式
      const legacyTotal =
        c.steps.reduce((sum, s) => sum + (s.defectSemiFinished ?? 0), 0) +
        computeBranchSemiFinishedQuantity(c.steps, c.links);
      expect(sources.reduce((sum, s) => sum + s.quantity, 0)).toBe(legacyTotal);
    });
  }

  it("発生元ごとに分かれ、工程順に並ぶ", () => {
    const steps = [mainA, mainB, branchR({ branchStock: "SEMI_FINISHED" })];
    expect(computeSemiFinishedSources(steps, [branchIn])).toEqual([
      { stepId: "b", kind: "DEFECT", quantity: 1 },
      { stepId: "r", kind: "BRANCH_TERMINAL", quantity: 2 },
    ]);
  });

  it("発生元の種類で、発生元の工程を数えるかが決まる", () => {
    const steps = [mainA, mainB, branchR({ branchStock: "SEMI_FINISHED" })];
    const links = [branchIn];
    // 途中で振り分けた分は b を終えていない
    expect(
      semiFinishedSourcePath(
        steps,
        links,
        { stepId: "b", kind: "DEFECT" },
        affects,
      ).stepIds,
    ).toEqual([10]);
    // 分岐終端は r を終えている
    expect(
      semiFinishedSourcePath(
        steps,
        links,
        { stepId: "r", kind: "BRANCH_TERMINAL" },
        affects,
      ).stepIds,
    ).toEqual([10, 60]);
  });
});

describe("matchWip", () => {
  const product: WipMatchProduct = {
    itemId: 100,
    materialTypeId: 7,
    diameterMm: 8,
    lengthMm: 330,
  };
  const route = [10, 20, 30];
  const bucket = (
    inventoryId: string,
    q: Partial<WipBucket> = {},
  ): WipBucket => ({
    inventoryId,
    materialTypeId: 7,
    diameterMm: 8,
    lengthMm: 330,
    stepIds: [10],
    available: 5,
    ...q,
  });

  it("寸法で 3 つの区分に分ける", () => {
    const r = matchWip(product, route, [
      bucket("exact"),
      bucket("longer", { lengthMm: 400 }),
      bucket("larger", { diameterMm: 10, lengthMm: 330 }),
      bucket("largerLonger", { diameterMm: 10, lengthMm: 400 }),
    ]);
    expect(r.exact.map((c) => c.inventoryId)).toEqual(["exact"]);
    expect(r.longer.map((c) => c.inventoryId)).toEqual(["longer"]);
    expect(r.largerDiameter.map((c) => c.inventoryId)).toEqual([
      "larger",
      "largerLonger",
    ]);
    expect(r.other).toEqual([]);
  });

  it("材種違い・細い・短い・在庫なしは候補にしない", () => {
    const r = matchWip(product, route, [
      bucket("otherType", { materialTypeId: 8 }),
      bucket("thin", { diameterMm: 6 }),
      bucket("short", { lengthMm: 300 }),
      bucket("thickShort", { diameterMm: 10, lengthMm: 300 }),
      bucket("empty", { available: 0 }),
    ]);
    expect([...r.exact, ...r.longer, ...r.largerDiameter, ...r.other]).toEqual(
      [],
    );
  });

  it("加工状態が製品の工程の先頭部分でなければ other", () => {
    const r = matchWip(product, route, [
      bucket("prefix", { stepIds: [10, 20] }),
      bucket("skipped", { stepIds: [20] }),
      bucket("extra", { stepIds: [10, 50] }),
    ]);
    expect(r.exact.map((c) => c.inventoryId)).toEqual(["prefix"]);
    expect(r.exact[0].remainingStepIds).toEqual([30]);
    expect(r.other.map((c) => c.inventoryId)).toEqual(["extra", "skipped"]);
    expect(r.other[0].remainingStepIds).toBeNull();
    expect(
      r.other.find((c) => c.inventoryId === "skipped")?.dimensionGroup,
    ).toBe("exact");
  });

  it("仕上がり寸法は区分の条件を満たさなければ候補にしない", () => {
    const r = matchWip(product, route, [
      bucket("exactOk", { finishedDiameterMm: 8 }),
      bucket("exactNg", { finishedDiameterMm: 7.9 }),
      bucket("largerGround", {
        diameterMm: 10,
        finishedDiameterMm: 7.5,
      }),
      bucket("largerOk", { diameterMm: 10, finishedDiameterMm: 9 }),
      bucket("longerCut", { lengthMm: 400, finishedLengthMm: 320 }),
    ]);
    expect(r.exact.map((c) => c.inventoryId)).toEqual(["exactOk"]);
    expect(r.largerDiameter.map((c) => c.inventoryId)).toEqual(["largerOk"]);
    expect(r.longer).toEqual([]);
  });

  it("区分の中は 目標製品が一致 → 古い順", () => {
    const r = matchWip(product, route, [
      bucket("new", { receivedAt: "2026-11-20T00:00:00Z" }),
      bucket("old", { receivedAt: "2026-10-01T00:00:00Z" }),
      bucket("aimedNew", {
        aimedItemId: 100,
        receivedAt: "2026-11-21T00:00:00Z",
      }),
      bucket("undated", { lotNumber: 5 }),
      bucket("aimedOther", {
        aimedItemId: 999,
        receivedAt: "2026-09-01T00:00:00Z",
      }),
    ]);
    expect(r.exact.map((c) => c.inventoryId)).toEqual([
      "aimedNew",
      "aimedOther",
      "old",
      "new",
      "undated",
    ]);
  });

  it("製品の要求素材が無ければ何も出さない", () => {
    expect(
      matchWip({ ...product, materialTypeId: null }, route, [bucket("a")]),
    ).toEqual({ exact: [], longer: [], largerDiameter: [], other: [] });
  });
});
