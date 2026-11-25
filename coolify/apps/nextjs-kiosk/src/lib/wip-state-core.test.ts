import { describe, expect, it } from "vitest";
import {
  checkWipRecordingDraft,
  computeSemiFinishedSources,
  defaultAffectsWipState,
  isWipPrefix,
  mainlinePartChangingStepIds,
  matchWip,
  orderSemiFinishedForConsumption,
  planWipPostings,
  semiFinishedSourcePath,
  storesWip,
  validateWipRecording,
  type WipBucket,
  type WipMatchProduct,
  type WipPostingStep,
  type WipRecordingView,
  wipBlankFor,
  wipPathForSource,
  wipRecordingPath,
  wipSignature,
  wipStateForSource,
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

describe("wipBlankFor", () => {
  const product = {
    requiresMaterialTypeId: 7,
    requiresDiameterMm: 8,
    requiresLengthMm: 100,
  };
  it("材種・径は指示書の素材、長さは製品の要求長", () => {
    expect(
      wipBlankFor({
        material: { materialTypeId: 3, diameterMm: 8.3 },
        product,
      }),
    ).toEqual({ materialTypeId: 3, diameterMm: 8.3, lengthMm: 100 });
  });
  it("素材が無い・欠けていれば製品の要求素材へ落ちる", () => {
    expect(wipBlankFor({ material: null, product })).toEqual({
      materialTypeId: 7,
      diameterMm: 8,
      lengthMm: 100,
    });
    expect(
      wipBlankFor({
        material: { materialTypeId: 3, diameterMm: null },
        product,
      }),
    ).toEqual({ materialTypeId: 7, diameterMm: 8, lengthMm: 100 });
  });
  it("どれかが決まらなければ null", () => {
    expect(
      wipBlankFor({
        material: { materialTypeId: 3, diameterMm: 8.3 },
        product: { ...product, requiresLengthMm: null },
      }),
    ).toBeNull();
  });
});

describe("wipRecordingPath / wipStateForSource", () => {
  const mainA = step("a", 10, 10);
  const mainB = step("b", 20, 20);
  const branchR = step("r", 60, 30, "COMPLETED", {
    branchStock: "SEMI_FINISHED",
  });
  const steps = [mainA, mainB, branchR];
  const links = [link("a", "r", 2)];

  it("経路 + 種類 は semiFinishedSourcePath と同じ加工状態になる", () => {
    for (const [stepId, kind] of [
      ["b", "DEFECT"],
      ["r", "BRANCH_TERMINAL"],
      ["r", "DEFECT"],
      ["b", "BRANCH_TERMINAL"],
    ] as const) {
      const src = steps.find((s) => s.id === stepId) as StepState;
      const upstream = wipRecordingPath(steps, links, stepId, affects).stepIds;
      expect(
        wipStateForSource(upstream, src.processStepId, kind, affects),
      ).toEqual(
        semiFinishedSourcePath(steps, links, { stepId, kind }, affects).stepIds,
      );
    }
  });

  it("数えない工程は分岐の終端でも加工状態に入らない", () => {
    expect(wipStateForSource([10], 40, "BRANCH_TERMINAL", affects)).toEqual([
      10,
    ]);
  });
});

describe("storesWip", () => {
  it("半製品の数があるか、半製品で終わる分岐の終端に良品があるとき", () => {
    expect(storesWip({ defectSemiFinished: 1, outputSuccess: 0 })).toBe(true);
    expect(
      storesWip({
        defectSemiFinished: 0,
        outputSuccess: 3,
        branchStock: "SEMI_FINISHED",
      }),
    ).toBe(true);
    expect(
      storesWip({
        defectSemiFinished: 0,
        outputSuccess: 0,
        branchStock: "SEMI_FINISHED",
      }),
    ).toBe(false);
    expect(
      storesWip({
        defectSemiFinished: 0,
        outputSuccess: 3,
        branchStock: "PRODUCT",
      }),
    ).toBe(false);
    expect(storesWip({ defectSemiFinished: null, outputSuccess: 5 })).toBe(
      false,
    );
  });
});

describe("validateWipRecording", () => {
  const blank = { diameterMm: 8.3, lengthMm: 100 };
  const plain = { stepIds: [10, 20], ambiguous: false, alternatives: [] };
  const none = { stepIds: [], ambiguous: false, alternatives: [] };
  const merged = {
    stepIds: [10, 20],
    ambiguous: true,
    alternatives: [[10, 60]],
  };
  const noValue = {
    finishedDiameterMm: null,
    finishedLengthMm: null,
    pathStepIds: null,
  };

  it("在庫に置かなければ何も求めず、入力も捨てる", () => {
    expect(
      validateWipRecording({
        stores: false,
        path: merged,
        sourceCountsAsDone: true,
        blank,
        input: { finishedDiameterMm: 5, pathStepIds: [10, 60] },
      }),
    ).toEqual({ issues: [], value: noValue });
  });

  it("形を変える工程が済んでいれば仕上がり寸法は必須", () => {
    const r = validateWipRecording({
      stores: true,
      path: plain,
      sourceCountsAsDone: false,
      blank,
      input: {},
    });
    expect(r.issues).toEqual([
      "finishedDiameterRequired",
      "finishedLengthRequired",
    ]);
    expect(
      validateWipRecording({
        stores: true,
        path: plain,
        sourceCountsAsDone: false,
        blank,
        input: { finishedDiameterMm: 8, finishedLengthMm: 99.5 },
      }),
    ).toEqual({
      issues: [],
      value: {
        finishedDiameterMm: 8,
        finishedLengthMm: 99.5,
        pathStepIds: null,
      },
    });
  });

  it("形を変える工程が 1 つも無ければブランクの寸法が既定（入力が優先）", () => {
    expect(
      validateWipRecording({
        stores: true,
        path: none,
        sourceCountsAsDone: false,
        blank,
        input: null,
      }).value,
    ).toEqual({
      finishedDiameterMm: 8.3,
      finishedLengthMm: 100,
      pathStepIds: null,
    });
    expect(
      validateWipRecording({
        stores: true,
        path: none,
        sourceCountsAsDone: false,
        blank,
        input: { finishedLengthMm: 90 },
      }).value,
    ).toEqual({
      finishedDiameterMm: 8.3,
      finishedLengthMm: 90,
      pathStepIds: null,
    });
    // ブランクが決まらない指示書は空のまま通す
    expect(
      validateWipRecording({
        stores: true,
        path: none,
        sourceCountsAsDone: false,
        blank: null,
        input: null,
      }),
    ).toEqual({ issues: [], value: noValue });
    // 経路が空でも、この工程自身が形を変える終端なら必須
    expect(
      validateWipRecording({
        stores: true,
        path: none,
        sourceCountsAsDone: true,
        blank,
        input: null,
      }).issues,
    ).toEqual(["finishedDiameterRequired", "finishedLengthRequired"]);
  });

  it("0 以下・桁外れの寸法は拒む", () => {
    expect(
      validateWipRecording({
        stores: true,
        path: plain,
        sourceCountsAsDone: false,
        blank,
        input: { finishedDiameterMm: 0, finishedLengthMm: 1e9 },
      }).issues,
    ).toEqual(["finishedDiameterInvalid", "finishedLengthInvalid"]);
  });

  it("合流の後は経路を選ばせる — 候補のどれかであること", () => {
    const dims = { finishedDiameterMm: 8, finishedLengthMm: 99 };
    const run = (pathStepIds?: number[]) =>
      validateWipRecording({
        stores: true,
        path: merged,
        sourceCountsAsDone: false,
        blank,
        input: { ...dims, pathStepIds },
      });
    expect(run().issues).toEqual(["pathChoiceRequired"]);
    expect(run([20, 10]).issues).toEqual(["pathChoiceInvalid"]);
    expect(run([10, 60]).value.pathStepIds).toEqual([10, 60]);
    // 推奨をそのまま確かめた場合も保存する（確かめた記録になる）
    expect(run([10, 20]).value.pathStepIds).toEqual([10, 20]);
  });

  it("曖昧でなければ経路は保存しない", () => {
    expect(
      validateWipRecording({
        stores: true,
        path: plain,
        sourceCountsAsDone: false,
        blank,
        input: {
          finishedDiameterMm: 8,
          finishedLengthMm: 99,
          pathStepIds: [1],
        },
      }).value.pathStepIds,
    ).toBeNull();
  });
});

describe("planWipPostings", () => {
  const blank = { diameterMm: 8.3, lengthMm: 100 };
  const mainA: WipPostingStep = step("a", 10, 10, "COMPLETED", {
    inputQuantity: 10,
    outputSuccess: 8,
    defectRework: 2,
  });
  const mainB: WipPostingStep = {
    ...step("b", 20, 20, "COMPLETED", {
      inputQuantity: 8,
      outputSuccess: 7,
      defectSemiFinished: 1,
    }),
    finishedDiameterMm: 8,
    finishedLengthMm: 99,
  };
  const branchR: WipPostingStep = {
    ...step("r", 60, 30, "COMPLETED", {
      inputQuantity: 2,
      outputSuccess: 2,
      branchStock: "SEMI_FINISHED",
    }),
    finishedDiameterMm: 7.9,
    finishedLengthMm: 98,
  };
  const links = [link("a", "r", 2)];

  it("発生元ごとに 1 本、加工状態と仕上がり寸法を運ぶ", () => {
    expect(
      planWipPostings([mainA, mainB, branchR], links, affects, blank),
    ).toEqual([
      {
        sourceStepId: "b",
        kind: "DEFECT",
        quantity: 1,
        stepIds: [10],
        finishedDiameterMm: 8,
        finishedLengthMm: 99,
      },
      {
        sourceStepId: "r",
        kind: "BRANCH_TERMINAL",
        quantity: 2,
        stepIds: [10, 60],
        finishedDiameterMm: 7.9,
        finishedLengthMm: 98,
      },
    ]);
  });

  it("合計は従来の 1 本にまとめた計上と同じ", () => {
    const variants: { steps: WipPostingStep[]; links: StepLinkState[] }[] = [
      { steps: [mainA, mainB, branchR], links },
      { steps: [mainA, mainB], links: [] },
      {
        steps: [mainA, mainB, { ...branchR, branchStock: null }],
        links: [...links, link("r", "b", 0)],
      },
      { steps: [mainA, mainB, { ...branchR, branchStock: "PRODUCT" }], links },
      {
        steps: [
          { ...mainA, defectSemiFinished: 3 },
          mainB,
          { ...branchR, defectSemiFinished: 1, outputSuccess: 1 },
        ],
        links,
      },
    ];
    for (const v of variants) {
      // onWorkOrderCompletedTx が第 2 段まで使っていた式
      const legacyTotal =
        v.steps.reduce((sum, s) => sum + (s.defectSemiFinished ?? 0), 0) +
        computeBranchSemiFinishedQuantity(v.steps, v.links);
      expect(
        planWipPostings(v.steps, v.links, affects, blank).reduce(
          (sum, p) => sum + p.quantity,
          0,
        ),
      ).toBe(legacyTotal);
    }
  });

  it("形を変える工程が済んでいない分はブランクの寸法、済んでいて未記録なら空", () => {
    const first: WipPostingStep = step("a", 10, 10, "COMPLETED", {
      inputQuantity: 10,
      outputSuccess: 9,
      defectSemiFinished: 1,
    });
    const second: WipPostingStep = step("b", 20, 20, "COMPLETED", {
      inputQuantity: 9,
      outputSuccess: 8,
      defectSemiFinished: 1,
    });
    expect(planWipPostings([first, second], [], affects, blank)).toEqual([
      {
        sourceStepId: "a",
        kind: "DEFECT",
        quantity: 1,
        stepIds: [],
        finishedDiameterMm: 8.3,
        finishedLengthMm: 100,
      },
      {
        sourceStepId: "b",
        kind: "DEFECT",
        quantity: 1,
        stepIds: [10],
        finishedDiameterMm: null,
        finishedLengthMm: null,
      },
    ]);
  });

  it("工程に記録した経路があれば推奨より優先する", () => {
    // r が b へ合流する — b から先は「本流（10,20）」か「分岐（10,60,20）」か曖昧
    const merge = [link("a", "r", 2), link("r", "b", 0)];
    const r: WipPostingStep = { ...branchR, branchStock: null };
    const b: WipPostingStep = { ...mainB, defectSemiFinished: 0 };
    const c: WipPostingStep = step("c", 30, 25, "COMPLETED", {
      inputQuantity: 9,
      outputSuccess: 8,
      defectSemiFinished: 1,
    });
    expect(
      wipRecordingPath([mainA, b, c, r], merge, "c", affects).ambiguous,
    ).toBe(true);
    const recommended = planWipPostings(
      [mainA, b, c, r],
      merge,
      affects,
      blank,
    );
    expect(recommended.map((p) => p.stepIds)).toEqual([[10, 20]]);
    const chosen = planWipPostings(
      [mainA, b, { ...c, wipPathStepIds: [10, 60, 20] }, r],
      merge,
      affects,
      blank,
    );
    expect(chosen.map((p) => p.stepIds)).toEqual([[10, 60, 20]]);
  });
});

describe("mainlinePartChangingStepIds", () => {
  it("本流の形を変える工程だけを工程順に（分岐系列・キャンセルは除く）", () => {
    const steps = [
      step("s", 1, 5),
      step("a", 10, 10),
      step("x", 30, 15, "CANCELLED"),
      step("b", 20, 20, "PENDING"),
      step("i", 40, 25, "PENDING"),
      step("r", 60, 30, "PENDING"),
    ];
    expect(
      mainlinePartChangingStepIds(steps, [link("a", "r", 2)], affects),
    ).toEqual([10, 20]);
  });
});

describe("orderSemiFinishedForConsumption", () => {
  const b = (
    id: string,
    itemId: number,
    lotNumber: number,
    stepIds: number[] | null,
  ) => ({ id, itemId, lotNumber, stepIds });
  const buckets = [
    b("legacy", 500, 1, null),
    b("other-blank", 901, 2, [10]),
    b("too-far", 900, 3, [10, 20, 30]),
    b("fits", 900, 4, [10]),
    b("fresh", 900, 5, []),
  ];
  const args = { blankItemId: 900, routeStepIds: [10, 20], lotHint: null };

  it("続きから作れるもの（同じブランク・工程の先頭部分）が先、あとは渡された順", () => {
    expect(
      orderSemiFinishedForConsumption(buckets, args).map((x) => x.id),
    ).toEqual(["fits", "fresh", "legacy", "other-blank", "too-far"]);
  });

  it("狙いのロットが最優先", () => {
    expect(
      orderSemiFinishedForConsumption(buckets, { ...args, lotHint: 3 }).map(
        (x) => x.id,
      )[0],
    ).toBe("too-far");
  });

  it("ブランクが決まらなければ渡された順のまま", () => {
    expect(
      orderSemiFinishedForConsumption(buckets, {
        ...args,
        blankItemId: null,
      }).map((x) => x.id),
    ).toEqual(["legacy", "other-blank", "too-far", "fits", "fresh"]);
  });
});

describe("checkWipRecordingDraft", () => {
  const view: WipRecordingView = {
    path: { stepIds: [10, 20], ambiguous: true, alternatives: [[10, 60]] },
    sourceAffects: true,
    sourceProcessStepId: 30,
    branchStock: null,
    blank: { diameterMm: 8.3, lengthMm: 100 },
    stepNames: {},
  };
  const draft = {
    finishedDiameterMm: null,
    finishedLengthMm: null,
    pathIndex: 0,
  };

  it("在庫に置かない完了では何も求めない", () => {
    expect(
      checkWipRecordingDraft(
        view,
        { defectSemiFinished: 0, outputSuccess: 5 },
        draft,
      ),
    ).toEqual({
      states: [],
      dimensionsRequired: false,
      input: null,
      issues: [],
    });
  });

  it("半製品の数があれば寸法を求め、選んだ経路を載せる", () => {
    const q = { defectSemiFinished: 1, outputSuccess: 4 };
    const missing = checkWipRecordingDraft(view, q, draft);
    expect(missing.states).toEqual([{ kind: "DEFECT", stepIds: [10, 20] }]);
    expect(missing.dimensionsRequired).toBe(true);
    expect(missing.issues).toEqual([
      "finishedDiameterRequired",
      "finishedLengthRequired",
    ]);
    const ok = checkWipRecordingDraft(view, q, {
      finishedDiameterMm: 8,
      finishedLengthMm: 99,
      pathIndex: 1,
    });
    expect(ok.issues).toEqual([]);
    expect(ok.states).toEqual([{ kind: "DEFECT", stepIds: [10, 60] }]);
    expect(ok.input).toEqual({
      finishedDiameterMm: 8,
      finishedLengthMm: 99,
      pathStepIds: [10, 60],
    });
  });

  it("半製品で終わる分岐の終端は、この工程まで済んだ状態になる", () => {
    const terminal: WipRecordingView = {
      ...view,
      path: { stepIds: [], ambiguous: false, alternatives: [] },
      branchStock: "SEMI_FINISHED",
    };
    const r = checkWipRecordingDraft(
      terminal,
      { defectSemiFinished: 1, outputSuccess: 2 },
      draft,
    );
    expect(r.states).toEqual([
      { kind: "DEFECT", stepIds: [] },
      { kind: "BRANCH_TERMINAL", stepIds: [30] },
    ]);
    expect(r.dimensionsRequired).toBe(true);
    expect(r.input?.pathStepIds).toBeNull();
    // 画面の判定とサーバーの判定（validateWipRecording）が同じ答えになる
    expect(r.issues).toEqual(
      validateWipRecording({
        stores: true,
        path: terminal.path,
        sourceCountsAsDone: true,
        blank: terminal.blank,
        input: r.input,
      }).issues,
    );
  });
});
