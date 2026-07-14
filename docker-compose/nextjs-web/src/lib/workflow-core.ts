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

// ─── 実行側（§7: 開始可否・数量伝播・DAG 検証・レイアウト） ─────────────────

export type StepRunStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface StepState {
  id: string; // work_order_steps.id (uuid)
  processStepId: number; // カタログ id（実行依存の解決キー）
  status: StepRunStatus;
  sortOrder: number;
  inputQuantity: number | null;
  outputSuccess: number | null;
  defectSemiFinished: number | null;
  defectScrap: number | null;
  defectRework: number | null;
  sessionLockedBy: string | null;
}

export interface StepLinkState {
  sourceStepId: string;
  targetStepId: string;
  routedQuantity: number;
}

export interface WorkflowCtx {
  plannedQuantity: number;
  steps: StepState[];
  links: StepLinkState[];
  execDeps: ExecDep[];
}

export interface QuantityIssue {
  kind: "NEGATIVE" | "CONSERVATION" | "ROUTING";
  message: string;
}

/**
 * 工程を開始してよいか（§7 実行依存 + DAG + ロック）。
 * - 実行依存は「この指示書に存在する工程」に対してのみ評価（不在 = 空真 —
 *   素材属性条件・省略工程・動的順序に対応）。AND は全完了、OR 群は 1 つ完了。
 * - 分岐エッジの流入元（incoming links）はすべて完了していること。
 * - 既に開始/完了/中止済み・他者のセッションロック中は不可。
 */
export function canStartStep(
  stepId: string,
  ctx: WorkflowCtx,
  actorId?: string | null,
): { ok: boolean; reasons: string[] } {
  const step = ctx.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, reasons: ["工程が見つかりません"] };
  const reasons: string[] = [];

  if (step.status !== "PENDING")
    reasons.push("この工程は開始できる状態ではありません");
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId)
    reasons.push("別のユーザーがセッション中です");

  // カタログ実行依存 — 指示書内に存在する工程のみで評価
  const byCatalog = new Map<number, StepState[]>();
  for (const s of ctx.steps) {
    if (s.status === "CANCELLED") continue;
    const list = byCatalog.get(s.processStepId) ?? [];
    list.push(s);
    byCatalog.set(s.processStepId, list);
  }
  const deps = ctx.execDeps.filter((d) => d.stepId === step.processStepId);
  const orGroup: number[] = [];
  for (const d of deps) {
    const targets = byCatalog.get(d.dependsOnStepId);
    if (!targets || targets.length === 0) continue; // 不在 = 空真
    if (d.relation === "AND") {
      if (!targets.every((t) => t.status === "COMPLETED"))
        reasons.push(`実行依存が未完了です（工程 ${d.dependsOnStepId}）`);
    } else {
      orGroup.push(d.dependsOnStepId);
    }
  }
  if (orGroup.length > 0) {
    const satisfied = orGroup.some((cid) =>
      (byCatalog.get(cid) ?? []).some((t) => t.status === "COMPLETED"),
    );
    if (!satisfied) reasons.push("実行依存（いずれか）が未完了です");
  }

  // 流入エッジ（分岐合流）はすべて完了
  for (const l of ctx.links) {
    if (l.targetStepId !== stepId) continue;
    const src = ctx.steps.find((s) => s.id === l.sourceStepId);
    if (src && src.status !== "COMPLETED" && src.status !== "CANCELLED")
      reasons.push("分岐元の工程が未完了です");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 工程の想定受入数: Σ流入エッジ routed → 前工程（sortOrder 順・CANCELLED
 * スキップ）の良品数 → 先頭工程は予定数量。
 */
export function expectedInput(stepId: string, ctx: WorkflowCtx): number | null {
  const step = ctx.steps.find((s) => s.id === stepId);
  if (!step) return null;

  const incoming = ctx.links.filter((l) => l.targetStepId === stepId);
  if (incoming.length > 0)
    return incoming.reduce((sum, l) => sum + l.routedQuantity, 0);

  const ordered = [...ctx.steps]
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const idx = ordered.findIndex((s) => s.id === stepId);
  if (idx < 0) return null;
  // 直前の「分岐先でない」工程の良品数を継ぐ（分岐先は合流エッジ側で受ける）
  for (let i = idx - 1; i >= 0; i--) {
    const prev = ordered[i];
    const isBranchTarget = ctx.links.some((l) => l.targetStepId === prev.id);
    if (isBranchTarget) continue;
    if (prev.outputSuccess != null) return prev.outputSuccess;
    return null; // 前工程が未記録
  }
  return ctx.plannedQuantity;
}

/** 数量整合（§7）: 良品 + 半製品 + 廃棄 + 手直し = 受入。全て 0 以上。 */
export function validateQuantities(step: {
  inputQuantity: number | null;
  outputSuccess: number | null;
  defectSemiFinished: number | null;
  defectScrap: number | null;
  defectRework: number | null;
}): QuantityIssue[] {
  const issues: QuantityIssue[] = [];
  const input = step.inputQuantity ?? 0;
  const success = step.outputSuccess ?? 0;
  const semi = step.defectSemiFinished ?? 0;
  const scrap = step.defectScrap ?? 0;
  const rework = step.defectRework ?? 0;
  for (const [label, v] of [
    ["受入数", input],
    ["良品数", success],
    ["半製品", semi],
    ["廃棄", scrap],
    ["手直し", rework],
  ] as const) {
    if (v < 0)
      issues.push({
        kind: "NEGATIVE",
        message: `${label}は 0 以上で入力してください`,
      });
  }
  if (success + semi + scrap + rework !== input) {
    issues.push({
      kind: "CONSERVATION",
      message: `良品 + 不良（半製品・廃棄・手直し）の合計（${success + semi + scrap + rework}）が受入数（${input}）と一致しません`,
    });
  }
  return issues;
}

/** 分岐ルーティング整合: Σrouted = 良品 + 手直し（半製品・廃棄はフロー外）。 */
export function validateRouting(
  step: { outputSuccess: number | null; defectRework: number | null },
  outgoing: readonly StepLinkState[],
): QuantityIssue[] {
  if (outgoing.length === 0) return [];
  const total = outgoing.reduce((s, l) => s + l.routedQuantity, 0);
  const expected = (step.outputSuccess ?? 0) + (step.defectRework ?? 0);
  if (total !== expected) {
    return [
      {
        kind: "ROUTING",
        message: `分岐数量の合計（${total}）が 良品 + 手直し（${expected}）と一致しません`,
      },
    ];
  }
  return [];
}

/** DAG 形状検証: 自己ループ・未知端点・閉路の検出（Kahn）。 */
export function validateDagShape(
  steps: readonly { id: string }[],
  links: readonly StepLinkState[],
): string[] {
  const ids = new Set(steps.map((s) => s.id));
  const errors: string[] = [];
  for (const l of links) {
    if (l.sourceStepId === l.targetStepId)
      errors.push("自己ループは作成できません");
    if (!ids.has(l.sourceStepId) || !ids.has(l.targetStepId))
      errors.push("リンクの端点が指示書外です");
  }
  if (errors.length > 0) return errors;

  const indeg = new Map<string, number>();
  for (const s of steps) indeg.set(s.id, 0);
  for (const l of links)
    indeg.set(l.targetStepId, (indeg.get(l.targetStepId) ?? 0) + 1);
  const queue = [...indeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.pop();
    if (id == null) break;
    visited++;
    for (const l of links) {
      if (l.sourceStepId !== id) continue;
      const d = (indeg.get(l.targetStepId) ?? 0) - 1;
      indeg.set(l.targetStepId, d);
      if (d === 0) queue.push(l.targetStepId);
    }
  }
  if (visited < steps.length) errors.push("分岐が循環しています");
  return errors;
}

export interface GraphNode {
  id: string;
  layer: number; // 横位置（トポロジカル層）
  row: number; // 縦位置（層内の行）
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

/** DAG の層状レイアウト（SVG 描画用）。エッジに沿って layer が単調増加。 */
export function layoutWorkflowGraph(
  steps: readonly StepState[],
  links: readonly StepLinkState[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ordered = [...steps].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const layer = new Map<string, number>();
  ordered.forEach((s, i) => {
    layer.set(s.id, i); // 基本は直列順
  });

  // エッジ制約: to.layer > from.layer（数回の緩和で十分 — 小規模 DAG）
  for (let pass = 0; pass < links.length + 1; pass++) {
    let changed = false;
    for (const l of links) {
      const from = layer.get(l.sourceStepId) ?? 0;
      const to = layer.get(l.targetStepId) ?? 0;
      if (to <= from) {
        layer.set(l.targetStepId, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 層内の行割り当て
  const rows = new Map<number, number>();
  const nodes: GraphNode[] = ordered.map((s) => {
    const ly = layer.get(s.id) ?? 0;
    const row = rows.get(ly) ?? 0;
    rows.set(ly, row + 1);
    return { id: s.id, layer: ly, row };
  });

  const edges: GraphEdge[] = links.map((l) => ({
    from: l.sourceStepId,
    to: l.targetStepId,
    label: String(l.routedQuantity),
  }));
  return { nodes, edges };
}

/** 仕掛数（WIP）: IN_PROGRESS は受入数、開始可能な PENDING は想定受入。 */
export function computeWipByStep(
  ctx: WorkflowCtx,
): { stepId: string; processStepId: number; wip: number }[] {
  const result: { stepId: string; processStepId: number; wip: number }[] = [];
  for (const s of ctx.steps) {
    if (s.status === "IN_PROGRESS") {
      result.push({
        stepId: s.id,
        processStepId: s.processStepId,
        wip: s.inputQuantity ?? 0,
      });
    } else if (s.status === "PENDING") {
      const upstream = canStartStep(s.id, ctx);
      if (upstream.ok) {
        const exp = expectedInput(s.id, ctx);
        if (exp != null && exp > 0)
          result.push({
            stepId: s.id,
            processStepId: s.processStepId,
            wip: exp,
          });
      }
    }
  }
  return result;
}

/** 全工程完了か（CANCELLED は除外）。1 つも実工程が無ければ false。 */
export function isWorkOrderComplete(ctx: WorkflowCtx): boolean {
  const active = ctx.steps.filter((s) => s.status !== "CANCELLED");
  return active.length > 0 && active.every((s) => s.status === "COMPLETED");
}

/**
 * 下流工程の閉包（DAG 到達性）: 線形の次工程（分岐流入先はスキップ —
 * expectedInput と同じ規則）+ 流出エッジ先を辿った集合。巻き戻しガードは
 * sortOrder ではなくこれで判定する（合流先は分岐工程より小さい sortOrder を
 * 持ち得るため）。
 */
export function downstreamStepIds(stepId: string, ctx: WorkflowCtx): string[] {
  const ordered = ctx.steps
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const isBranchTarget = (id: string) =>
    ctx.links.some((l) => l.targetStepId === id);
  const linearNext = (id: string): string | null => {
    const idx = ordered.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < ordered.length; i++) {
      if (!isBranchTarget(ordered[i].id)) return ordered[i].id;
    }
    return null;
  };

  const seen = new Set<string>();
  const queue = [stepId];
  while (queue.length > 0) {
    const cur = queue.pop();
    if (cur == null) break;
    const nexts: string[] = [];
    const ln = linearNext(cur);
    if (ln) nexts.push(ln);
    for (const l of ctx.links) {
      if (l.sourceStepId === cur) nexts.push(l.targetStepId);
    }
    for (const n of nexts) {
      if (n !== stepId && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return [...seen];
}
