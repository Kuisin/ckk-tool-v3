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
    }));
    expect(defaultOrder([9, 7, 1, 8], catalog)).toEqual([1, 7, 8, 9]);
  });
});
