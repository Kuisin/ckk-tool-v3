import { describe, expect, it } from "vitest";
import { findDependencyCycle } from "./process-step-dependency-core";

describe("findDependencyCycle", () => {
  it("辺が無ければ循環なし", () => {
    expect(findDependencyCycle([])).toBeNull();
  });

  it("直列の依存（A→B→C）は循環なし", () => {
    expect(
      findDependencyCycle([
        { stepId: 1, dependsOnStepId: 2 },
        { stepId: 2, dependsOnStepId: 3 },
      ]),
    ).toBeNull();
  });

  it("菱形（合流）は循環ではない", () => {
    expect(
      findDependencyCycle([
        { stepId: 1, dependsOnStepId: 2 },
        { stepId: 1, dependsOnStepId: 3 },
        { stepId: 2, dependsOnStepId: 4 },
        { stepId: 3, dependsOnStepId: 4 },
      ]),
    ).toBeNull();
  });

  it("自己依存は長さ 1 の輪として返す", () => {
    expect(findDependencyCycle([{ stepId: 5, dependsOnStepId: 5 }])).toEqual([
      5, 5,
    ]);
  });

  it("2 工程の相互依存を検出する", () => {
    expect(
      findDependencyCycle([
        { stepId: 1, dependsOnStepId: 2 },
        { stepId: 2, dependsOnStepId: 1 },
      ]),
    ).toEqual([1, 2, 1]);
  });

  it("離れた工程を経由する輪を、輪の部分だけ返す（前置きの辺は含めない）", () => {
    const cycle = findDependencyCycle([
      { stepId: 10, dependsOnStepId: 1 }, // 輪の外から入る辺
      { stepId: 1, dependsOnStepId: 2 },
      { stepId: 2, dependsOnStepId: 3 },
      { stepId: 3, dependsOnStepId: 1 },
    ]);
    expect(cycle).toEqual([1, 2, 3, 1]);
  });

  it("保存しようとしている工程の辺を足した瞬間に閉じる輪を見つける", () => {
    // 既存: B は A に依存。いま A を「B に依存」に編集しようとしている
    const existing = [{ stepId: 2, dependsOnStepId: 1 }];
    const editing = [{ stepId: 1, dependsOnStepId: 2 }];
    expect(findDependencyCycle([...existing, ...editing])).toEqual([2, 1, 2]);
    // 編集を取り消せば（辺を外せば）循環は消える
    expect(findDependencyCycle(existing)).toBeNull();
  });

  describe("through（保存する工程を通る輪だけ）", () => {
    const edges = [
      { stepId: 1, dependsOnStepId: 2 }, // 保存中の工程 1 → 2
      { stepId: 2, dependsOnStepId: 3 },
      { stepId: 3, dependsOnStepId: 2 }, // 既存データに残る、1 を通らない輪
    ];

    it("自分を通らない既存の輪では止めない", () => {
      expect(findDependencyCycle(edges, 1)).toBeNull();
      // through 無しなら、その輪は輪として見つかる
      expect(findDependencyCycle(edges)).toEqual([2, 3, 2]);
    });

    it("自分を通る輪は、自分から始まる並びで返す", () => {
      expect(
        findDependencyCycle([...edges, { stepId: 3, dependsOnStepId: 1 }], 1),
      ).toEqual([1, 2, 3, 1]);
    });

    it("自分が辺を持たなければ輪は無い", () => {
      expect(findDependencyCycle(edges, 99)).toBeNull();
    });
  });
});
