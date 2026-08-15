/**
 * workflow-core.test.ts — ワークフロー構成検証（ビルダー側）のユニットテスト。
 *
 * 工程 id はカタログ seed の実データに寄せた最小フィクスチャ:
 *   1 素材出し / 3 素材受渡し / 7 円筒加工 / 8 円筒加工検査 / 9 円筒加工検査承認 /
 *   10 全長合わせ / 6 センタレス / 18 溝 / 19 刃裏 / 23 製作検査 / 24 製作検査承認
 */

import { describe, expect, it } from "vitest";
import {
  type CatalogStep,
  defaultOrder,
  isBlockingIssue,
  requiredCompanions,
  type UseDep,
  validateComposition,
} from "./workflow-core";

const dep = (
  stepId: number,
  dependsOnStepId: number,
  relation: "AND" | "OR" = "AND",
  isNegation = false,
): UseDep => ({ stepId, dependsOnStepId, relation, isNegation });

// 円筒加工まわり + 溝/刃裏の排他 + 製作検査（カタログ seed の抜粋と同型）
const USE_DEPS: UseDep[] = [
  // 円筒加工: 素材手配(OR) + 検査・検査承認(AND)
  dep(7, 1, "OR"),
  dep(7, 3, "OR"),
  dep(7, 8),
  dep(7, 9),
  // 円筒加工検査 → 円筒加工, 検査承認 → 検査
  dep(8, 7),
  dep(9, 8),
  // 全長合わせ: センタレス or 円筒加工検査承認（or 素材が研磨 = エッジなし）
  dep(10, 6, "OR"),
  dep(10, 9, "OR"),
  // 溝/刃裏: 素材準備済み(OR) + 製作検査系(AND) + 相互排他
  dep(18, 10, "OR"),
  dep(18, 23),
  dep(18, 24),
  dep(18, 19, "AND", true),
  dep(19, 10, "OR"),
  dep(19, 23),
  dep(19, 24),
  dep(19, 18, "AND", true),
  // 製作検査: 製作工程のいずれか(OR) + 検査承認(AND)
  dep(23, 18, "OR"),
  dep(23, 19, "OR"),
  dep(23, 24),
  dep(24, 23),
];

describe("validateComposition", () => {
  it("円筒加工に検査・検査承認が無いと MISSING_AND ×2", () => {
    const issues = validateComposition([1, 7], USE_DEPS);
    const missing = issues.filter((i) => i.kind === "MISSING_AND");
    expect(missing).toHaveLength(2);
    expect(missing.map((i) => i.relatedStepIds[0]).sort()).toEqual([8, 9]);
    expect(missing.every(isBlockingIssue)).toBe(true);
  });

  it("完全な円筒加工セットは issue なし", () => {
    expect(validateComposition([1, 7, 8, 9], USE_DEPS)).toEqual([]);
  });

  it("全長合わせ単独は OR グループ全不在 → 警告（素材が研磨なら妥当）", () => {
    const issues = validateComposition([10], USE_DEPS);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("MISSING_OR_GROUP");
    expect(issues[0].relatedStepIds.sort()).toEqual([6, 9]);
    expect(isBlockingIssue(issues[0])).toBe(false);
  });

  it("OR グループはいずれか 1 つの存在で充足", () => {
    expect(validateComposition([6, 10], USE_DEPS)).toEqual([]);
  });

  it("溝 + 刃裏の同時選択は双方向の EXCLUSION（ブロック）", () => {
    const issues = validateComposition([10, 18, 19, 23, 24], USE_DEPS);
    const exclusions = issues.filter((i) => i.kind === "EXCLUSION");
    expect(exclusions).toHaveLength(2);
    expect(exclusions.every(isBlockingIssue)).toBe(true);
  });
});

describe("requiredCompanions", () => {
  it("円筒加工の AND 依存を推移的に返す（検査 → 検査承認）", () => {
    // 検査(8) を足すと 検査承認(9) も必要になる — 閉包で両方返る
    expect(requiredCompanions([1, 7], USE_DEPS).sort()).toEqual([8, 9]);
  });

  it("排他エッジは追加しない", () => {
    const companions = requiredCompanions([10, 18], USE_DEPS);
    expect(companions).not.toContain(19); // 刃裏（排他）は含まない
    expect(companions.sort()).toEqual([23, 24]);
  });

  it("充足済みなら空", () => {
    expect(requiredCompanions([1, 7, 8, 9], USE_DEPS)).toEqual([]);
  });
});

describe("defaultOrder", () => {
  it("sortOrder 順に整列", () => {
    const catalog: CatalogStep[] = [
      { id: 7, sortOrder: 70 },
      { id: 1, sortOrder: 10 },
      { id: 9, sortOrder: 90 },
      { id: 8, sortOrder: 80 },
    ].map((c) => ({
      ...c,
      code: `S${c.id}`,
      nameJa: "",
      category: "MACHINING",
      executionLocation: "INTERNAL",
      isSyncCapable: false,
      isInspection: false,
      isApprovalStep: false,
      quantityTracking: "FLOW" as const,
    }));
    expect(defaultOrder([9, 7, 1, 8], catalog)).toEqual([1, 7, 8, 9]);
  });
});

// ─── 実行側（開始可否・数量伝播・DAG・レイアウト・WIP・完了判定） ────────────

import {
  branchableQuantity,
  canStartStep,
  computeFinishedQuantity,
  computeWipByStep,
  downstreamStepIds,
  type ExecDep,
  expectedInput,
  isOffMainline,
  isWorkOrderComplete,
  layoutWorkflowGraph,
  resolveLinkQuantity,
  type StepLinkState,
  type StepState,
  validateDagShape,
  validateQuantities,
  validateRouting,
  type WorkflowCtx,
} from "./workflow-core";

const step = (
  id: string,
  processStepId: number,
  sortOrder: number,
  status: StepState["status"] = "PENDING",
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

const edep = (
  stepId: number,
  dependsOnStepId: number,
  relation: "AND" | "OR" = "AND",
): ExecDep => ({ stepId, dependsOnStepId, relation });

describe("canStartStep", () => {
  // カタログ: 100 素材出し → 200 切断（AND 100）→ 300 検査（AND 200）
  const execDeps = [edep(200, 100), edep(300, 200)];

  it("AND 依存が完了していれば開始可", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("a", 100, 10, "COMPLETED"), step("b", 200, 20)],
      links: [],
      execDeps,
    };
    expect(canStartStep("b", ctx).ok).toBe(true);
  });

  it("AND 依存が未完了なら不可", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("a", 100, 10, "IN_PROGRESS"), step("b", 200, 20)],
      links: [],
      execDeps,
    };
    expect(canStartStep("b", ctx).ok).toBe(false);
  });

  it("依存先がワークフローに不在なら空真（素材属性・省略工程）", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("b", 200, 20)], // 100 不在
      links: [],
      execDeps,
    };
    expect(canStartStep("b", ctx).ok).toBe(true);
  });

  it("OR 依存はいずれか完了で可", () => {
    const orDeps = [edep(400, 100, "OR"), edep(400, 200, "OR")];
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [
        step("a", 100, 10, "COMPLETED"),
        step("b", 200, 20, "PENDING"),
        step("c", 400, 30),
      ],
      links: [],
      execDeps: orDeps,
    };
    expect(canStartStep("c", ctx).ok).toBe(true);
  });

  it("他者セッションロック中は不可・本人は可", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("b", 200, 20, "PENDING", { sessionLockedBy: "user-x" })],
      links: [],
      execDeps: [],
    };
    expect(canStartStep("b", ctx, "user-y").ok).toBe(false);
    expect(canStartStep("b", ctx, "user-x").ok).toBe(true);
  });

  it("分岐元が未完了なら合流先は開始不可", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("src", 100, 10, "IN_PROGRESS"), step("dst", 200, 20)],
      links: [{ sourceStepId: "src", targetStepId: "dst", routedQuantity: 5 }],
      execDeps: [],
    };
    expect(canStartStep("dst", ctx).ok).toBe(false);
  });
});

describe("expectedInput", () => {
  it("先頭工程は予定数量", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 100,
      steps: [step("a", 100, 10)],
      links: [],
      execDeps: [],
    };
    expect(expectedInput("a", ctx)).toBe(100);
  });

  it("直列は前工程の良品数を継ぐ（CANCELLED はスキップ）", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 100,
      steps: [
        step("a", 100, 10, "COMPLETED", {
          inputQuantity: 100,
          outputSuccess: 90,
        }),
        step("x", 150, 15, "CANCELLED"),
        step("b", 200, 20),
      ],
      links: [],
      execDeps: [],
    };
    expect(expectedInput("b", ctx)).toBe(90);
  });

  it("流入エッジがあれば Σrouted", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 100,
      steps: [
        step("a", 100, 10, "COMPLETED"),
        step("b", 200, 20),
        step("m", 300, 30),
      ],
      links: [
        { sourceStepId: "a", targetStepId: "m", routedQuantity: 8 },
        { sourceStepId: "b", targetStepId: "m", routedQuantity: 2 },
      ],
      execDeps: [],
    };
    expect(expectedInput("m", ctx)).toBe(10);
  });
});

describe("validateQuantities / validateRouting", () => {
  it("保存則: 良品+不良 = 受入", () => {
    expect(
      validateQuantities({
        inputQuantity: 10,
        outputSuccess: 7,
        defectSemiFinished: 1,
        defectScrap: 1,
        defectRework: 1,
      }),
    ).toEqual([]);
    expect(
      validateQuantities({
        inputQuantity: 10,
        outputSuccess: 7,
        defectSemiFinished: 1,
        defectScrap: 1,
        defectRework: 0,
      })[0].kind,
    ).toBe("CONSERVATION");
  });

  it("負数は NEGATIVE", () => {
    const issues = validateQuantities({
      inputQuantity: 5,
      outputSuccess: -1,
      defectSemiFinished: 0,
      defectScrap: 6,
      defectRework: 0,
    });
    expect(issues.some((i) => i.kind === "NEGATIVE")).toBe(true);
  });

  it("ルーティング: Σrouted = 良品 + 工程分岐", () => {
    const out: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "b", routedQuantity: 8 },
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
    ];
    expect(validateRouting({ outputSuccess: 8, defectRework: 2 }, out)).toEqual(
      [],
    );
    expect(
      validateRouting({ outputSuccess: 8, defectRework: 1 }, out)[0].kind,
    ).toBe("ROUTING");
  });

  it("INSPECTION モード: 同じ保存則・検査/合格ラベルのメッセージ", () => {
    const issues = validateQuantities(
      {
        inputQuantity: 10,
        outputSuccess: 7,
        defectSemiFinished: 0,
        defectScrap: 2,
        defectRework: 0,
      },
      "INSPECTION",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("CONSERVATION");
    expect(issues[0].message).toContain("検査数");
    expect(issues[0].message).toContain("合格");
  });

  it("NONE モード: 常に issue なし（サーバーがパススルー生成）", () => {
    expect(
      validateQuantities(
        {
          inputQuantity: null,
          outputSuccess: null,
          defectSemiFinished: null,
          defectScrap: null,
          defectRework: null,
        },
        "NONE",
      ),
    ).toEqual([]);
  });

  it("NONE パススルー規則: 完了時 output = input なら後続の expectedInput が成立", () => {
    // s1(FLOW, 良品8) → s2(NONE, パススルー 8→8) → s3 の想定受入は 8
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [
        step("s1", 100, 10, "COMPLETED", { outputSuccess: 8 }),
        step("s2", 200, 20, "COMPLETED", {
          inputQuantity: 8,
          outputSuccess: 8, // NONE 完了時のサーバー生成値（input と同値）
        }),
        step("s3", 300, 30, "PENDING"),
      ],
      links: [],
      execDeps: [],
    };
    expect(expectedInput("s3", ctx)).toBe(8);
    // 終端 NONE でも outputSuccess が非 null — onWorkOrderCompleted の
    // 終端工程集計の前提を守る
    const terminal = ctx.steps[1];
    expect(terminal.outputSuccess).not.toBeNull();
  });
});

describe("validateDagShape", () => {
  const ids = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("正常な分岐合流は OK", () => {
    expect(
      validateDagShape(ids, [
        { sourceStepId: "a", targetStepId: "b", routedQuantity: 1 },
        { sourceStepId: "b", targetStepId: "c", routedQuantity: 1 },
        { sourceStepId: "a", targetStepId: "c", routedQuantity: 1 },
      ]),
    ).toEqual([]);
  });
  it("閉路は拒否", () => {
    const errs = validateDagShape(ids, [
      { sourceStepId: "a", targetStepId: "b", routedQuantity: 1 },
      { sourceStepId: "b", targetStepId: "a", routedQuantity: 1 },
    ]);
    expect(errs.some((e) => e.includes("循環"))).toBe(true);
  });
  it("自己ループは拒否", () => {
    expect(
      validateDagShape(ids, [
        { sourceStepId: "a", targetStepId: "a", routedQuantity: 1 },
      ]).length,
    ).toBeGreaterThan(0);
  });
});

describe("layoutWorkflowGraph", () => {
  it("エッジに沿って layer が単調増加", () => {
    const steps = [step("a", 1, 10), step("b", 2, 20), step("r", 3, 15)];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "b", routedQuantity: 2 },
    ];
    const { nodes } = layoutWorkflowGraph(steps, links);
    const layer = new Map(nodes.map((n) => [n.id, n.layer]));
    expect(layer.get("r")).toBeGreaterThan(layer.get("a") ?? 99);
    expect(layer.get("b")).toBeGreaterThan(layer.get("r") ?? 99);
  });
});

describe("computeWipByStep / isWorkOrderComplete", () => {
  it("工程分岐分岐の一巡: IN_PROGRESS の受入 + 開始可能 PENDING の想定受入", () => {
    // a 完了(10 → 良品8, 工程分岐2) → b（8 流入）, rework（2 流入）
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [
        step("a", 100, 10, "COMPLETED", {
          inputQuantity: 10,
          outputSuccess: 8,
          defectRework: 2,
          defectSemiFinished: 0,
          defectScrap: 0,
        }),
        step("rework", 150, 15),
        step("b", 200, 20, "IN_PROGRESS", { inputQuantity: 8 }),
      ],
      links: [
        { sourceStepId: "a", targetStepId: "rework", routedQuantity: 2 },
        { sourceStepId: "a", targetStepId: "b", routedQuantity: 8 },
      ],
      execDeps: [],
    };
    const wip = computeWipByStep(ctx);
    expect(wip.find((w) => w.stepId === "b")?.wip).toBe(8);
    expect(wip.find((w) => w.stepId === "rework")?.wip).toBe(2);
    expect(isWorkOrderComplete(ctx)).toBe(false);
  });

  it("全完了（CANCELLED 除外）で完了", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [
        step("a", 100, 10, "COMPLETED"),
        step("x", 150, 15, "CANCELLED"),
        step("b", 200, 20, "COMPLETED"),
      ],
      links: [],
      execDeps: [],
    };
    expect(isWorkOrderComplete(ctx)).toBe(true);
  });
});

describe("downstreamStepIds", () => {
  // s1(10) → s2(20) → [branch(40) 経由の合流] → s3(30)
  const steps = [
    step("s1", 100, 10, "COMPLETED"),
    step("s2", 200, 20, "COMPLETED"),
    step("s3", 300, 30, "COMPLETED"),
    step("br", 400, 40, "COMPLETED"),
  ];
  const links: StepLinkState[] = [
    { sourceStepId: "s2", targetStepId: "br", routedQuantity: 2 },
    { sourceStepId: "br", targetStepId: "s3", routedQuantity: 2 },
  ];
  const ctx: WorkflowCtx = { plannedQuantity: 10, steps, links, execDeps: [] };

  it("合流先（小さい sortOrder でも）は分岐工程の下流", () => {
    expect(downstreamStepIds("br", ctx)).toEqual(["s3"]);
  });

  it("末端（合流先）の下流は空 → 巻き戻し可", () => {
    expect(downstreamStepIds("s3", ctx)).toEqual([]);
  });

  it("先頭の下流は全工程", () => {
    expect(downstreamStepIds("s1", ctx).sort()).toEqual(["br", "s2", "s3"]);
  });
});

// ─── 分岐/合流の数量セマンティクス（オフメインライン・動的エッジ） ────────────

describe("isOffMainline / resolveLinkQuantity", () => {
  // メインライン a(10) → b(20) → c(30)。分岐 a→r1(40, 静的2) → r2(50, 動的) → c(動的)
  const steps = [
    step("a", 100, 10, "COMPLETED", {
      inputQuantity: 10,
      outputSuccess: 8,
      defectRework: 2,
      defectSemiFinished: 0,
      defectScrap: 0,
    }),
    step("b", 200, 20, "COMPLETED", { inputQuantity: 8, outputSuccess: 8 }),
    step("c", 300, 30),
    step("r1", 400, 40, "COMPLETED", {
      inputQuantity: 2,
      outputSuccess: 1,
      defectScrap: 1,
      defectSemiFinished: 0,
      defectRework: 0,
    }),
    step("r2", 500, 50),
  ];
  const links: StepLinkState[] = [
    { sourceStepId: "a", targetStepId: "r1", routedQuantity: 2 },
    { sourceStepId: "r1", targetStepId: "r2", routedQuantity: 0 },
    { sourceStepId: "r2", targetStepId: "c", routedQuantity: 0 },
  ];
  const ctx: WorkflowCtx = { plannedQuantity: 10, steps, links, execDeps: [] };

  it("分岐系列はオフメインライン・合流先はメインライン", () => {
    expect(isOffMainline("r1", ctx)).toBe(true);
    expect(isOffMainline("r2", ctx)).toBe(true);
    expect(isOffMainline("c", ctx)).toBe(false); // 合流先（流入元は高 sortOrder）
    expect(isOffMainline("a", ctx)).toBe(false);
    expect(isOffMainline("b", ctx)).toBe(false);
  });

  it("動的リンクは分岐元の良品数へ解決・未完了は null・静的はそのまま", () => {
    expect(resolveLinkQuantity(links[0], steps)).toBe(2); // 静的
    expect(resolveLinkQuantity(links[1], steps)).toBe(1); // r1 良品 1
    expect(resolveLinkQuantity(links[2], steps)).toBe(null); // r2 未完了
  });

  it("チェーン内の受入は上流の不良に追従（r2 = r1 の良品 1）", () => {
    expect(expectedInput("r2", ctx)).toBe(1);
  });
});

describe("expectedInput — 合流の加算", () => {
  it("合流先 = メインライン前工程の良品 + 分岐流入", () => {
    // a 完了(良8/手2) → b 完了(良7) → c 合流先。分岐 a→r(静的2) 完了(良2) → c(動的)
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 8, outputSuccess: 7 }),
      step("c", 300, 30),
      step("r", 400, 40, "COMPLETED", { inputQuantity: 2, outputSuccess: 2 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "c", routedQuantity: 0 },
    ];
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps,
      links,
      execDeps: [],
    };
    expect(expectedInput("c", ctx)).toBe(7 + 2);
  });

  it("合流先より後の工程は合流先の良品数を継ぐ", () => {
    // a 完了 → b 合流先（完了・良9） → c。分岐 a→r(静的2) → b(動的)
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 10, outputSuccess: 9 }),
      step("c", 300, 30),
      step("r", 400, 40, "COMPLETED", { inputQuantity: 2, outputSuccess: 2 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "b", routedQuantity: 0 },
    ];
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps,
      links,
      execDeps: [],
    };
    expect(expectedInput("c", ctx)).toBe(9);
  });

  it("分岐元が未完了なら合流先の受入は未確定（null）", () => {
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 8, outputSuccess: 8 }),
      step("c", 300, 30),
      step("r", 400, 40, "IN_PROGRESS", { inputQuantity: 2 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "c", routedQuantity: 0 },
    ];
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps,
      links,
      execDeps: [],
    };
    expect(expectedInput("c", ctx)).toBe(null);
  });
});

describe("branchableQuantity", () => {
  const src = (over: Partial<StepState> = {}) =>
    step("a", 100, 10, "COMPLETED", {
      inputQuantity: 10,
      outputSuccess: 8,
      defectRework: 2,
      defectSemiFinished: 0,
      defectScrap: 0,
      ...over,
    });

  it("メインライン後続があれば工程分岐数まで", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [src(), step("b", 200, 20)],
      links: [],
      execDeps: [],
    };
    expect(branchableQuantity("a", ctx)).toBe(2);
  });

  it("既存の静的分岐分を差し引く", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [src(), step("b", 200, 20), step("r", 300, 30)],
      links: [{ sourceStepId: "a", targetStepId: "r", routedQuantity: 1 }],
      execDeps: [],
    };
    expect(branchableQuantity("a", ctx)).toBe(1);
  });

  it("終端工程（後続なし）は 良品 + 工程分岐 まで", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [src()],
      links: [],
      execDeps: [],
    };
    expect(branchableQuantity("a", ctx)).toBe(10);
  });

  it("未完了の工程は null", () => {
    const ctx: WorkflowCtx = {
      plannedQuantity: 10,
      steps: [step("a", 100, 10)],
      links: [],
      execDeps: [],
    };
    expect(branchableQuantity("a", ctx)).toBe(null);
  });
});

describe("computeFinishedQuantity", () => {
  it("直列: 最終工程の良品のみ", () => {
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 9 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 9, outputSuccess: 8 }),
    ];
    expect(computeFinishedQuantity(steps, [])).toBe(8);
  });

  it("合流なし分岐: メインライン終端 + 分岐末端の合計", () => {
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 8, outputSuccess: 8 }),
      step("r", 300, 30, "COMPLETED", { inputQuantity: 2, outputSuccess: 1 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
    ];
    expect(computeFinishedQuantity(steps, links)).toBe(8 + 1);
  });

  it("合流あり: 合流先のみ計上（動的流出を持つ分岐末端は 0）", () => {
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("b", 200, 20, "COMPLETED", { inputQuantity: 10, outputSuccess: 10 }),
      step("r", 300, 30, "COMPLETED", { inputQuantity: 2, outputSuccess: 2 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "b", routedQuantity: 0 },
    ];
    expect(computeFinishedQuantity(steps, links)).toBe(10);
  });

  it("終端工程からの分岐: 静的流出は工程分岐優先で差し引き残良品を計上", () => {
    // a 終端 良8/手2、a→r 静的3（手2 + 良1）→ a の残 7、r 良3 → 計 10
    const steps = [
      step("a", 100, 10, "COMPLETED", { outputSuccess: 8, defectRework: 2 }),
      step("r", 300, 30, "COMPLETED", { inputQuantity: 3, outputSuccess: 3 }),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 3 },
    ];
    expect(computeFinishedQuantity(steps, links)).toBe(7 + 3);
  });
});

describe("layoutWorkflowGraph — レーンと暗黙フロー", () => {
  it("メインラインはレーン 0・分岐系列はレーン 1、合流先はより後の layer", () => {
    const steps = [
      step("a", 1, 10, "COMPLETED"),
      step("b", 2, 20),
      step("r", 3, 30),
    ];
    const links: StepLinkState[] = [
      { sourceStepId: "a", targetStepId: "r", routedQuantity: 2 },
      { sourceStepId: "r", targetStepId: "b", routedQuantity: 0 },
    ];
    const { nodes, edges } = layoutWorkflowGraph(steps, links);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("a")?.row).toBe(0);
    expect(byId.get("b")?.row).toBe(0);
    expect(byId.get("r")?.row).toBe(1);
    expect(
      edges.some((e) => e.kind === "flow" && e.from === "a" && e.to === "b"),
    ).toBe(true);
    expect(byId.get("r")?.layer).toBeGreaterThan(byId.get("a")?.layer ?? 99);
    expect(byId.get("b")?.layer).toBeGreaterThan(byId.get("r")?.layer ?? 99);
  });
});
