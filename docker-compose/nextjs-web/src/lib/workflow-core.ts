/**
 * workflow-core.ts — 製造ワークフローの純ロジック（ビルダー側）。
 *
 * 工程カタログの使用依存（use deps）に対する構成検証と必須随伴工程の解決。
 * Prisma I/O は持たない（server 側は lib/workflow.ts）。実行側
 * （canStartStep / 数量伝播）は PR 3 で追加する。
 *
 * 依存セマンティクス（migration の seed 規約と一致）:
 * - AND エッジ: 依存先がすべてワークフローに存在すること（不足 = エラー）。
 * - OR エッジ群: 1 工程の OR エッジ全体で 1 グループ。いずれか存在すれば充足。
 *   全員不在は「警告」に留める — 素材属性由来の条件（素材が研磨・定尺 等）は
 *   エッジ化されておらず、グループ全不在で充足されるケースがあるため。
 * - is_negation（排他）: 依存先が存在してはならない（存在 = エラー）。
 */

export interface CatalogStep {
  id: number;
  code: string;
  nameJa: string;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  sortOrder: number;
}

export interface UseDep {
  stepId: number;
  dependsOnStepId: number;
  relation: "AND" | "OR";
  isNegation: boolean;
}

export interface ExecDep {
  stepId: number;
  dependsOnStepId: number;
  relation: "AND" | "OR";
}

export type CompositionIssueKind =
  | "MISSING_AND" // AND 依存先が未選択（ブロック）
  | "MISSING_OR_GROUP" // OR グループ全員不在（警告 — 素材属性で充足の可能性）
  | "EXCLUSION"; // 排他工程が同時選択（ブロック）

export interface CompositionIssue {
  stepId: number;
  kind: CompositionIssueKind;
  /** 依存先 stepId（OR グループは全員）。 */
  relatedStepIds: number[];
}

/** issue がブロッカー（保存不可）か。OR 全不在は警告扱い。 */
export function isBlockingIssue(issue: CompositionIssue): boolean {
  return issue.kind !== "MISSING_OR_GROUP";
}

/**
 * 選択された工程集合の構成検証。
 * 返る issue は選択工程ごとに: 不足 AND（1 件ずつ）/ 全不在 OR グループ
 * （グループで 1 件）/ 排他違反（1 件ずつ）。
 */
export function validateComposition(
  selected: readonly number[],
  useDeps: readonly UseDep[],
): CompositionIssue[] {
  const sel = new Set(selected);
  const issues: CompositionIssue[] = [];

  for (const stepId of selected) {
    const deps = useDeps.filter((d) => d.stepId === stepId);
    const orGroup: number[] = [];

    for (const d of deps) {
      if (d.isNegation) {
        if (sel.has(d.dependsOnStepId)) {
          issues.push({
            stepId,
            kind: "EXCLUSION",
            relatedStepIds: [d.dependsOnStepId],
          });
        }
        continue;
      }
      if (d.relation === "AND") {
        if (!sel.has(d.dependsOnStepId)) {
          issues.push({
            stepId,
            kind: "MISSING_AND",
            relatedStepIds: [d.dependsOnStepId],
          });
        }
      } else {
        orGroup.push(d.dependsOnStepId);
      }
    }

    if (orGroup.length > 0 && !orGroup.some((id) => sel.has(id))) {
      issues.push({
        stepId,
        kind: "MISSING_OR_GROUP",
        relatedStepIds: orGroup,
      });
    }
  }

  return issues;
}

/**
 * AND 依存（非排他）の推移的閉包 — 「必須工程を自動追加」用。
 * 選択集合に不足している AND 依存先を、その依存先の依存も含めて返す。
 */
export function requiredCompanions(
  selected: readonly number[],
  useDeps: readonly UseDep[],
): number[] {
  const result = new Set(selected);
  const queue = [...selected];
  while (queue.length > 0) {
    const stepId = queue.pop();
    if (stepId == null) break;
    for (const d of useDeps) {
      if (
        d.stepId === stepId &&
        d.relation === "AND" &&
        !d.isNegation &&
        !result.has(d.dependsOnStepId)
      ) {
        result.add(d.dependsOnStepId);
        queue.push(d.dependsOnStepId);
      }
    }
  }
  return [...result].filter((id) => !selected.includes(id));
}

/** カタログ既定順（sortOrder → id）で並べた工程 id 列。 */
export function defaultOrder(
  selected: readonly number[],
  catalog: readonly CatalogStep[],
): number[] {
  const order = new Map(catalog.map((c) => [c.id, c.sortOrder]));
  return [...selected].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a - b,
  );
}
