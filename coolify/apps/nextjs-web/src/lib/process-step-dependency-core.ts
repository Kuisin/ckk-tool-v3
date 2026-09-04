/**
 * process-step-dependency-core.ts — 工程マスタの実行依存（process_step_exec_dependencies）
 * が循環していないかの判定。純ロジック（I/O なし）。
 *
 * 実行依存は「この工程を始めるには依存先が完了していること」なので、循環が
 * あると、その輪に入る工程はどれも永遠に開始できない（ワークフローの実行可否
 * 判定 canStartStep が全部 false を返す）。DB には循環を止める制約が無いので、
 * 保存する Server Action がここで弾く。
 */

export interface DependencyEdge {
  /** 依存する側の工程 id */
  stepId: number;
  /** 依存先（先に完了していなければならない工程）の id */
  dependsOnStepId: number;
}

/**
 * 有向グラフ（stepId → dependsOnStepId）に循環があれば、その輪を
 * `[a, b, …, a]`（先頭と末尾が同じ id）で返す。無ければ null。
 *
 * `edges` には保存後の全辺を渡す — 既存の他工程の辺 + いま保存しようとしている
 * 工程の辺（その工程の旧い辺は除く）。判定は DFS 1 回（O(V+E)）。
 *
 * `through` を渡すと、**その工程を通る輪だけ**を探す（`through` から DFS を始め、
 * `through` へ戻る辺だけを輪とみなす）。保存しようとしている工程と無関係な、
 * 既存データに残っている輪で保存を止めないため。
 */
export function findDependencyCycle(
  edges: ReadonlyArray<DependencyEdge>,
  through?: number,
): number[] | null {
  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    const list = adjacency.get(e.stepId);
    if (list) list.push(e.dependsOnStepId);
    else adjacency.set(e.stepId, [e.dependsOnStepId]);
  }
  // 0 = 未訪問 / 1 = 訪問中（現在のパス上） / 2 = 完了
  const state = new Map<number, 0 | 1 | 2>();
  const stack: number[] = [];

  const visit = (node: number): number[] | null => {
    state.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1 && (through == null || next === through)) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (s === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };

  if (through != null) return visit(through);

  // 辺の並び順で決定的に探索する（同じ入力なら同じ輪を返す）
  for (const e of edges) {
    if ((state.get(e.stepId) ?? 0) === 0) {
      const found = visit(e.stepId);
      if (found) return found;
    }
  }
  return null;
}
